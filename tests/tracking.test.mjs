import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import worker from '../worker/index.js';

const origin = 'https://nexo-ecommerce-lp.nexoprotp.chatgpt.site';
const env = { META_PIXEL_ID: '1093543073252356', META_GRAPH_VERSION: 'v25.0', META_ACCESS_TOKEN: 'test-secret-only' };
const event = () => ({ event_name: 'PageView', event_id: webcrypto.randomUUID(), event_time: Math.floor(Date.now() / 1000), event_source_url: origin + '/', fbp: 'fb.1.1789730000000.123456789' });
function request(path, body, headers = {}) {
  return new Request(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'User-Agent': 'Nexo integration test', ...headers }, body: JSON.stringify(body) });
}

test('CAPI preserves deduplication ID, strips URL parameters and keeps credentials server-side', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init, data: JSON.parse(init.body) });
    return Response.json({ events_received: 1 });
  });
  const input = event();
  input.event_source_url += '?private=must-not-be-forwarded';
  let result = await worker.fetch(request('/api/meta/events', input), env);
  assert.equal(result.status, 200);
  assert.equal(calls[0].data.data[0].event_id, input.event_id);
  assert.equal(calls[0].data.data[0].event_source_url, origin + '/');
  assert.equal(calls[0].data.data[0].user_data.fbp, input.fbp);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-secret-only');
  assert(!calls[0].url.includes('test-secret-only'));
  assert(!(await result.text()).includes('test-secret-only'));
  result = await worker.fetch(request('/api/meta/events', input), env);
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1, 'retry is not sent again after success');
});

test('invalid and cross-origin events never reach Meta; opt-out suppresses tracking', async t => {
  const spy = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not be called'); });
  assert.equal((await worker.fetch(request('/api/meta/events', event(), { Origin: 'https://elsewhere.example' }), env)).status, 403);
  assert.equal((await worker.fetch(request('/api/meta/events', { ...event(), event_name: 'Lead' }), env)).status, 400);
  assert.equal((await worker.fetch(request('/api/meta/events', { ...event(), event_time: 1 }), env)).status, 400);
  assert.equal((await worker.fetch(request('/api/meta/events', { ...event(), padding: 'x'.repeat(5000) }), env)).status, 400);
  assert.equal((await worker.fetch(request('/api/meta/events', event(), { 'Sec-GPC': '1' }), env)).status, 204);
  assert.equal((await worker.fetch(request('/api/meta/events', event(), { DNT: '1' }), env)).status, 204);
  assert.equal(spy.mock.callCount(), 0);
});

test('Meta errors are sanitized and never reported as success', async t => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 190, message: 'test-secret-only' } }, { status: 400 }));
  const result = await worker.fetch(request('/api/meta/events', event()), env);
  assert.equal(result.status, 502);
  assert.equal((await result.json()).error, 'delivery_failed');
});

test('website assets pass through and lead journey stays inactive until destinations exist', async () => {
  const config = await worker.fetch(new Request(origin + '/api/leads/config'), env);
  assert.deepEqual(await config.json(), { enabled: false });
  const page = await worker.fetch(new Request(origin + '/'), { ...env, ASSETS: { fetch: async () => new Response('original website') } });
  assert.equal(await page.text(), 'original website');
});

function lead() {
  return { id: webcrypto.randomUUID(), nome: 'Pessoa de Teste', telefone: '(44) 99999-1234', email: 'contato@example.com', empresa: 'Empresa de teste', tipo_projeto: 'Landing page', investimento: 'Ainda preciso definir', prazo: 'Nos próximos 30 dias', event_source_url: origin + '/', utm: { utm_source: 'test', unexpected: 'ignored' } };
}
const leadEnv = { ...env, WHATSAPP_NUMBER: '5544999990000', CRM_WEBHOOK_URL: 'https://crm.example.test/webhook', CRM_WEBHOOK_TOKEN: 'crm-test-secret' };

test('qualified lead reaches CRM before Lead conversion and WhatsApp continuation', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return Response.json(url === leadEnv.CRM_WEBHOOK_URL ? { accepted: true } : { events_received: 1 });
  });
  const input = lead();
  const result = await worker.fetch(request('/api/leads', input), leadEnv);
  assert.equal(result.status, 200);
  const saved = await result.json();
  assert(saved.whatsapp_url.startsWith('https://wa.me/5544999990000?text='));
  const whatsapp = new URL(saved.whatsapp_url);
  assert.equal(whatsapp.searchParams.get('text'), 'Olá, Nexo! Gostaria de conversar sobre um projeto.');
  for (const answer of [input.nome, input.telefone, input.email, input.empresa, input.tipo_projeto, input.investimento, input.prazo]) {
    assert(!decodeURIComponent(saved.whatsapp_url).includes(answer), 'qualification answers must only reach the CRM');
  }
  assert.equal(calls[0].url, leadEnv.CRM_WEBHOOK_URL);
  assert.equal(calls[0].init.headers['Idempotency-Key'], input.id);
  assert.equal(calls[0].body.telefone, '5544999991234');
  assert.equal(calls[0].body.email, 'contato@example.com');
  assert.equal(calls[0].body.investimento, input.investimento);
  assert(!('unexpected' in calls[0].body.utm));
  assert.equal(calls[1].body.data[0].event_name, 'Lead');
  assert.equal(calls[1].body.data[0].event_id, input.id);
  assert(!JSON.stringify(calls[1].body).includes(input.nome), 'lead PII only goes to the CRM');
  assert(!JSON.stringify(calls[1].body).includes(input.email), 'email only goes to the CRM');
  await worker.fetch(request('/api/leads', input), leadEnv);
  assert.equal(calls.length, 2, 'retry does not duplicate a completed submission');
});

test('missing or invalid email never reaches the CRM', async t => {
  const spy = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not be called'); });
  for (const email of [undefined, '', 'sem-arroba', 'nome@', 'nome @empresa.com']) {
    const result = await worker.fetch(request('/api/leads', { ...lead(), email }), leadEnv);
    assert.equal(result.status, 400);
  }
  assert.equal(spy.mock.callCount(), 0);
});

test('CRM rejection does not emit Lead or provide a WhatsApp success response', async t => {
  t.mock.method(console, 'error', () => {});
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => { calls.push(url); return new Response('', { status: 500 }); });
  const result = await worker.fetch(request('/api/leads', lead()), leadEnv);
  assert.equal(result.status, 502);
  assert.equal(calls.length, 1);
  assert(!('whatsapp_url' in await result.json()));
});

test('browser PageView shares exact event ID and cookie with CAPI; internal links are not contacts', async () => {
  const source = await readFile('public/analytics.js', 'utf8');
  const listeners = {};
  const requests = [];
  const cookies = new Map();
  const document = {
    createElement: () => ({}), head: { appendChild() {} },
    addEventListener(name, fn) { listeners[name] = fn; },
    get cookie() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); },
    set cookie(value) { const [k, v] = value.split(';')[0].split('='); cookies.set(k, v); }
  };
  const window = {};
  vm.runInNewContext(source, { window, document, navigator: {}, crypto: webcrypto, URL, location: new URL(origin + '/'), fetch: async (url, init) => { requests.push(JSON.parse(init.body)); return new Response('', { status: 200 }); }, setTimeout });
  const queued = window.fbq.queue.map(args => [...args]);
  const pageView = queued.find(args => args[0] === 'track' && args[1] === 'PageView');
  assert.equal(pageView[3].eventID, requests[0].event_id);
  assert.equal(requests[0].fbp, decodeURIComponent(cookies.get('_fbp')));
  listeners.click({ isTrusted: true, target: { closest: () => ({ href: origin + '/#contato' }) } });
  assert.equal(requests.length, 1);
  listeners['nexo:lead-saved']({ detail: { eventId: 'crm-accepted-id' } });
  assert.equal([...window.fbq.queue.at(-1)][3].eventID, 'crm-accepted-id');
  assert.equal(requests.length, 1, 'Lead was sent server-side only once');
});

test('browser opt-out installs neither Pixel nor server tracking', async () => {
  const source = await readFile('public/analytics.js', 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, navigator: { globalPrivacyControl: true } });
  assert.equal(window.fbq, undefined);
});
