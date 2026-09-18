const ALLOWED_EVENTS = new Set(['PageView', 'Contact']);
const MAX_BODY = 4096;
const requests = new Map();
const completed = new Map();

function reply(status, body) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new Error('size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let length = 0;
  let text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) { await reader.cancel(); throw new Error('size'); }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

function rateLimited(ip, now) {
  if (!ip) return false;
  if (requests.size >= 1000) {
    for (const [key, value] of requests) if (now - value.time > 60000) requests.delete(key);
    if (requests.size >= 1000) requests.delete(requests.keys().next().value);
  }
  let bucket = requests.get(ip);
  if (!bucket || now - bucket.time > 60000) bucket = { time: now, count: 0 };
  bucket.count += 1;
  requests.set(ip, bucket);
  return bucket.count > 40;
}

export async function conversions(request, env, acceptedLead = false) {
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const sourceOrigin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== sourceOrigin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site') return reply(403, { error: 'forbidden' });
  if (request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1') return reply(204);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return reply(415, { error: 'unsupported_content_type' });
  }
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP');
  if (rateLimited(ip, now)) return reply(429, { error: 'try_later' });
  let input;
  try { input = await readBody(request); } catch { return reply(400, { error: 'invalid_event' }); }
  if (!input || !(ALLOWED_EVENTS.has(input.event_name) || (acceptedLead && input.event_name === 'Lead')) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.event_id) ||
      !Number.isInteger(input.event_time) || Math.abs(input.event_time - Math.floor(now / 1000)) > 300) {
    return reply(400, { error: 'invalid_event' });
  }
  let source;
  try { source = new URL(input.event_source_url); } catch { return reply(400, { error: 'invalid_source' }); }
  if (source.origin !== sourceOrigin || !['/', '/index.html'].includes(source.pathname)) {
    return reply(400, { error: 'invalid_source' });
  }
  if (!/^\d{5,25}$/.test(env.META_PIXEL_ID || '') || !env.META_ACCESS_TOKEN ||
      !/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION || '')) {
    return reply(503, { error: 'unavailable' });
  }
  const key = `${input.event_name}:${input.event_id}`;
  if (completed.get(key) > now - 300000) return reply(200, { ok: true });
  const userData = {};
  const agent = request.headers.get('User-Agent');
  if (agent) userData.client_user_agent = agent.slice(0, 1000);
  if (ip && /^[a-fA-F0-9:.]{3,45}$/.test(ip)) userData.client_ip_address = ip;
  if (/^fb\.\d+\.\d{13}\.\d{1,20}$/.test(input.fbp || '')) userData.fbp = input.fbp;
  if (/^fb\.\d+\.\d{13}\.[A-Za-z0-9_-]{1,1000}$/.test(input.fbc || '')) userData.fbc = input.fbc;
  const event = {
    event_name: input.event_name, event_id: input.event_id, event_time: input.event_time,
    action_source: 'website', event_source_url: source.origin + source.pathname, user_data: userData
  };
  if (input.event_name === 'Contact') {
    event.custom_data = { content_name: input.channel === 'whatsapp' ? 'Contato pelo WhatsApp' : 'Contato pelo Instagram', content_category: 'Contato' };
  } else if (input.event_name === 'Lead') {
    event.custom_data = { content_name: 'Solicitação de projeto Nexo', content_category: 'Projeto' };
  }
  const payload = { data: [event] };
  if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.META_PIXEL_ID}/events`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json', 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`
      }, body: JSON.stringify(payload), signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok || result.events_received !== 1) {
      // Never log tokens, visitor identifiers, raw requests or Meta's raw error message.
      console.error('Meta conversion delivery failed', { status: response.status, code: result.error?.code });
      return reply(502, { error: 'delivery_failed' });
    }
    if (completed.size >= 2000) {
      for (const [id, time] of completed) if (time < now - 300000) completed.delete(id);
      if (completed.size >= 2000) completed.delete(completed.keys().next().value);
    }
    completed.set(key, now);
    return reply(200, { ok: true });
  } catch {
    console.error('Meta conversion delivery unavailable');
    return reply(502, { error: 'delivery_failed' });
  } finally { clearTimeout(timer); }
}

const projects = new Set(['E-commerce', 'Landing page', 'Redesign do meu site', 'Quero ajuda para definir']);
const budgets = new Set(['Até R$ 3 mil', 'De R$ 3 mil a R$ 6 mil', 'De R$ 6 mil a R$ 10 mil', 'Acima de R$ 10 mil', 'Ainda preciso definir']);
const deadlines = new Set(['O quanto antes', 'Nos próximos 30 dias', 'Em 1 a 3 meses', 'Estou planejando']);
const acceptedSubmissions = new Map();

export function leadReady(env) {
  try {
    const url = new URL(env.CRM_WEBHOOK_URL);
    return /^\d{10,15}$/.test(env.WHATSAPP_NUMBER || '') && url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

export async function saveLead(request, env, ctx) {
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return reply(403, { error: 'forbidden' });
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reply(415, { error: 'unsupported_content_type' });
  if (!leadReady(env)) return reply(503, { error: 'unavailable' });
  const now = Date.now();
  if (rateLimited(request.headers.get('CF-Connecting-IP'), now)) return reply(429, { error: 'try_later' });
  let input;
  try { input = await readBody(request); } catch { return reply(400, { error: 'invalid_lead' }); }
  const name = typeof input?.nome === 'string' ? input.nome.trim() : '';
  const phone = typeof input?.telefone === 'string' ? input.telefone.replace(/\D/g, '') : '';
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input?.id) ||
      name.length < 2 || name.length > 100 || !/^(?:55)?[1-9]{2}\d{8,9}$/.test(phone) ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !projects.has(input.tipo_projeto) || !budgets.has(input.investimento) || !deadlines.has(input.prazo) ||
      (input.empresa != null && (typeof input.empresa !== 'string' || input.empresa.length > 120))) return reply(400, { error: 'invalid_lead' });
  let source;
  try { source = new URL(input.event_source_url); } catch { return reply(400, { error: 'invalid_source' }); }
  if (source.origin !== origin || !['/', '/index.html'].includes(source.pathname)) return reply(400, { error: 'invalid_source' });
  const previous = acceptedSubmissions.get(input.id);
  if (previous && previous.time > now - 300000) return reply(200, previous.response);
  const utm = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    if (typeof input.utm?.[key] === 'string') utm[key] = input.utm[key].slice(0, 200);
  }
  const lead = {
    id: input.id, evento: 'lead.qualificado', nome: name,
    telefone: phone.length <= 11 ? '55' + phone : phone,
    email,
    empresa: input.empresa?.trim() || '', tipo_projeto: input.tipo_projeto,
    investimento: input.investimento, prazo: input.prazo,
    origem: 'Landing page Nexo', pagina: source.origin + source.pathname,
    criado_em: new Date(now).toISOString(), contato_solicitado: true, utm
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': input.id };
    if (env.CRM_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${env.CRM_WEBHOOK_TOKEN}`;
    const result = await fetch(env.CRM_WEBHOOK_URL, {
      method: 'POST', headers, body: JSON.stringify(lead), signal: controller.signal, redirect: 'error'
    });
    if (!result.ok) {
      console.error('CRM lead delivery failed', { status: result.status });
      return reply(502, { error: 'delivery_failed' });
    }
  } catch {
    console.error('CRM lead delivery unavailable');
    return reply(502, { error: 'delivery_failed' });
  } finally { clearTimeout(timer); }
  // Qualification answers belong only in the CRM, never in a WhatsApp URL or message.
  const message = 'Olá, Nexo! Gostaria de conversar sobre um projeto.';
  const response = { ok: true, whatsapp_url: `https://wa.me/${env.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}` };
  if (acceptedSubmissions.size >= 500) {
    for (const [key, value] of acceptedSubmissions) if (value.time < now - 300000) acceptedSubmissions.delete(key);
    if (acceptedSubmissions.size >= 500) acceptedSubmissions.delete(acceptedSubmissions.keys().next().value);
  }
  acceptedSubmissions.set(input.id, { time: now, response });
  const meta = conversions(new Request(request.url, {
    method: 'POST', headers: request.headers,
    body: JSON.stringify({ event_name: 'Lead', event_id: input.id, event_time: Math.floor(now / 1000), event_source_url: lead.pagina, fbp: input.fbp, fbc: input.fbc })
  }), env, true);
  if (ctx?.waitUntil) ctx.waitUntil(meta); else await meta;
  return reply(200, response);
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/api/meta/events') return conversions(request, env);
    if (path === '/api/leads/config') return reply(200, { enabled: leadReady(env) });
    if (path === '/api/leads') return saveLead(request, env, ctx);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};
