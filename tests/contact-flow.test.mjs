import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile('public/lead-modal.js', 'utf8');
const html = await readFile('public/index.html', 'utf8');
const whatsapp = 'https://wa.me/5544998168355?text=' + encodeURIComponent('Olá, Nexo! Gostaria de conversar sobre um projeto.');

function element() {
  return { handlers: {}, hidden: false, addEventListener(name, fn) { this.handlers[name] = fn; }, focus() { this.focused = true; } };
}
function harness(respond = async () => Response.json({ ok: true, whatsapp_url: whatsapp })) {
  const redirects = [], calls = [], events = [], classes = new Set();
  const floating = element(), close = element();
  const forms = [0, 1].map(() => {
    const form = element(), submit = element(), status = element(), success = element(), continuation = element();
    success.hidden = true;
    success.querySelector = () => continuation;
    const panel = { querySelector: selector => selector === '.lead-success' ? success : continuation };
    form.elements = Object.fromEntries(Object.entries({ nome: 'Contato de teste', telefone: '(44) 99999-1234', email: 'contato@example.com', empresa: 'Marca', tipo_projeto: 'Landing page', investimento: 'Ainda preciso definir', prazo: 'O quanto antes' }).map(([key, value]) => [key, { value, setCustomValidity(message) { this.validation = message; }, reportValidity() {} }]));
    form.reportValidity = () => true;
    form.querySelector = selector => selector === '.lead-status' ? status : submit;
    form.closest = () => panel;
    return { form, panel, submit, status, success, continuation };
  });
  const dialog = element();
  dialog.querySelector = () => close;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.handlers.close(); };
  dialog.getBoundingClientRect = () => ({ left: 20, right: 540, top: 20, bottom: 700 });
  const document = {
    cookie: '', handlers: {},
    documentElement: { classList: { add: key => classes.add(key), remove: key => classes.delete(key) } },
    getElementById: id => id === 'lead-dialog' ? dialog : forms[0].form,
    querySelector: () => floating,
    querySelectorAll: () => forms.map(f => f.form),
    addEventListener(name, fn) { this.handlers[name] = fn; },
    dispatchEvent(event) { events.push(event); }
  };
  const location = { href: 'https://nexo.example/?utm_source=campanha', origin: 'https://nexo.example', pathname: '/', assign: url => redirects.push(url) };
  class FormData { constructor(form) { this.entries = Object.entries(form.elements).map(([k, v]) => [k, v.value]); } [Symbol.iterator]() { return this.entries[Symbol.iterator](); } }
  vm.runInNewContext(source, {
    document, crypto: webcrypto, URL, location, FormData, AbortController, setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    fetch: async (url, init) => { calls.push({ url, payload: JSON.parse(init.body) }); return respond(url, init); }
  });
  return { forms, floating, close, dialog, document, calls, events, redirects, classes };
}
const submitEvent = () => ({ preventDefault() {} });

test('floating WhatsApp opens and closes the modal immediately, without an API gate', () => {
  const h = harness();
  h.floating.handlers.click();
  assert.equal(h.dialog.open, true);
  assert(h.classes.has('lead-modal-open'));
  assert.equal(h.calls.length, 0);
  h.close.handlers.click();
  assert.equal(h.dialog.open, false);
  assert.equal(h.classes.size, 0);
  assert.equal(h.floating.focused, true);
});

test('other CTAs keep anchor navigation and select the project in the inline form', () => {
  const h = harness();
  let prevented = false;
  h.document.handlers.click({ target: { closest: () => ({ textContent: 'Quero criar meu e-commerce' }) }, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(h.dialog.open, undefined);
  assert.equal(h.forms[0].form.elements.tipo_projeto.value, 'E-commerce');
});

for (const [index, name] of ['inline form', 'modal form'].entries()) {
  test(name + ' sends qualification and redirects only after CRM acceptance', async () => {
    let accept;
    const h = harness(() => new Promise(resolve => { accept = resolve; }));
    const submission = h.forms[index].form.handlers.submit(submitEvent());
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, '/api/leads');
    assert.equal(h.calls[0].payload.tipo_projeto, 'Landing page');
    assert.equal(h.calls[0].payload.email, 'contato@example.com');
    assert.equal(h.calls[0].payload.utm.utm_source, 'campanha');
    assert.equal(h.redirects.length, 0);
    assert(h.forms.every(f => f.submit.disabled));
    accept(Response.json({ ok: true, whatsapp_url: whatsapp }));
    await submission;
    assert.deepEqual(h.redirects, [whatsapp]);
    assert(h.forms.every(f => f.form.hidden && !f.success.hidden));
    assert.equal(h.events.filter(e => e.type === 'nexo:lead-saved').length, 1);
    assert.equal(new URL(h.redirects[0]).searchParams.get('text'), 'Olá, Nexo! Gostaria de conversar sobre um projeto.');
  });
}

test('delivery failure preserves input and retry ID without redirecting or claiming success', async () => {
  const h = harness(async () => Response.json({ error: 'delivery_failed' }, { status: 502 }));
  const active = h.forms[1];
  await active.form.handlers.submit(submitEvent());
  assert.equal(h.redirects.length, 0);
  assert.equal(h.events.length, 0);
  assert.equal(active.form.hidden, false);
  assert(active.status.textContent.includes('tente novamente'));
  assert.equal(active.form.elements.nome.value, 'Contato de teste');
  await active.form.handlers.submit(submitEvent());
  assert.equal(h.calls[0].payload.id, h.calls[1].payload.id);
});

test('both forms and floating button are included in initial page markup', () => {
  assert.match(html, /<button class="whatsapp-float"[^>]*data-open-lead/);
  assert.match(html, /<form id="contact-lead-form" data-lead-form>/);
  assert.match(html, /<form id="lead-form" data-lead-form>/);
  assert.equal((html.match(/name="telefone"/g) || []).length, 2);
  assert.equal((html.match(/name="email" type="email"[^>]*required/g) || []).length, 2);
  assert(!html.includes('https://www.instagram.com/nexopro.tp/'));
  assert.match(html, /lead-modal.js\?v=2/);
});
