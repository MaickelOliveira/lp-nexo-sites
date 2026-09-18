(() => {
  'use strict';
  // Only the public Pixel ID belongs in the browser. CAPI credentials stay server-side.
  const PIXEL_ID = '1093543073252356';
  if (window.__nexoMetaStarted || navigator.globalPrivacyControl === true ||
      navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  window.__nexoMetaStarted = true;

  function readCookie(name) {
    try {
      const value = document.cookie.split('; ').find(row => row.startsWith(name + '='));
      return value ? decodeURIComponent(value.slice(name.length + 1)) : '';
    } catch { return ''; }
  }
  function cookie(name, value) {
    try {
      document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=7776000; Path=/; SameSite=Lax; Secure`;
    } catch { /* Cookie restrictions must not interfere with the page. */ }
    return value;
  }
  const random = () => crypto.getRandomValues(new Uint32Array(1))[0];
  const fbp = readCookie('_fbp') || cookie('_fbp', `fb.1.${Date.now()}.${random()}`);
  const clickId = new URL(location.href).searchParams.get('fbclid');
  const fbc = clickId && /^[A-Za-z0-9_-]{1,1000}$/.test(clickId)
    ? cookie('_fbc', `fb.1.${Date.now()}.${clickId}`) : readCookie('_fbc');

  if (!window.fbq) {
    const fbq = window.fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  window.fbq('set', 'autoConfig', false, PIXEL_ID);
  window.fbq('init', PIXEL_ID);

  async function sendServerEvent(payload, attempt = 0) {
    try {
      const response = await fetch('/api/meta/events', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if ((response.status >= 500 || response.status === 429) && attempt === 0) {
        setTimeout(() => sendServerEvent(payload, 1), 1200);
      }
    } catch {
      if (attempt === 0) setTimeout(() => sendServerEvent(payload, 1), 1200);
    }
  }
  function track(name, customData = {}) {
    const id = crypto.randomUUID();
    try { window.fbq('track', name, customData, { eventID: id }); } catch { /* Nonblocking. */ }
    void sendServerEvent({
      event_name: name, event_id: id, event_time: Math.floor(Date.now() / 1000),
      event_source_url: location.origin + location.pathname,
      fbp: readCookie('_fbp') || fbp, fbc: readCookie('_fbc') || fbc,
      channel: customData.content_name === 'Contato pelo WhatsApp' ? 'whatsapp' : 'instagram'
    });
  }
  track('PageView');

  let lastContact = 0;
  function onContact(event) {
    if (!event.isTrusted || (event.type === 'auxclick' && event.button !== 1)) return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== 'https://www.instagram.com' || url.pathname !== '/nexopro.tp/') return;
    if (Date.now() - lastContact < 1200) return;
    lastContact = Date.now();
    track('Contact', { content_name: 'Contato pelo Instagram', content_category: 'Contato' });
  }
  document.addEventListener('click', onContact);
  document.addEventListener('auxclick', onContact);
  document.addEventListener('nexo:lead-saved', event => {
    // The server already sent this Lead after CRM acceptance; share its ID for deduplication.
    const id = event.detail?.eventId;
    if (typeof id === 'string') window.fbq('track', 'Lead', {
      content_name: 'Solicitação de projeto Nexo', content_category: 'Projeto'
    }, { eventID: id });
  });
  document.addEventListener('nexo:whatsapp-open', () => {
    track('Contact', { content_name: 'Contato pelo WhatsApp', content_category: 'Contato' });
  });
})();
