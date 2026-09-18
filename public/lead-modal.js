(() => {
  'use strict';
  const dialog = document.getElementById('lead-dialog');
  const floatingButton = document.querySelector('[data-open-lead]');
  const forms = [...document.querySelectorAll('[data-lead-form]')];
  if (!dialog || !floatingButton || !forms.length) return;
  let saving = false;
  let completed = null;
  let opener;

  // Both controls exist at first paint; no API response gates opening a form.
  floatingButton.addEventListener('click', () => {
    opener = floatingButton;
    dialog.showModal();
    document.documentElement.classList.add('lead-modal-open');
  });
  dialog.querySelector('.lead-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('lead-modal-open');
    opener?.focus({ preventScroll: true });
  });

  // Other page CTAs retain native navigation to the visible contact form.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href="#contato"]');
    if (!link || completed) return;
    const copy = link.textContent.toLowerCase();
    const inline = document.getElementById('contact-lead-form');
    if (copy.includes('e-commerce')) inline.elements.tipo_projeto.value = 'E-commerce';
    if (copy.includes('landing page')) inline.elements.tipo_projeto.value = 'Landing page';
  });

  function cookie(name) {
    try { return decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith(name + '='))?.slice(name.length + 1) || ''); }
    catch { return ''; }
  }
  function showSuccess(whatsappUrl) {
    forms.forEach(form => {
      const panel = form.closest('[data-lead-panel]');
      form.hidden = true;
      const success = panel.querySelector('.lead-success');
      success.hidden = false;
      success.querySelector('[data-whatsapp-continue]').href = whatsappUrl;
    });
    document.dispatchEvent(new CustomEvent('nexo:layout'));
  }

  forms.forEach(form => {
    const panel = form.closest('[data-lead-panel]');
    const status = form.querySelector('.lead-status');
    const submit = form.querySelector('[type="submit"]');
    let submissionId = crypto.randomUUID();
    let lastFingerprint = '';

    form.addEventListener('input', () => {
      form.elements.telefone.setCustomValidity('');
      status.textContent = '';
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving || completed) return;
      const phone = form.elements.telefone.value.replace(/\D/g, '');
      if (!/^(?:55)?[1-9]{2}\d{8,9}$/.test(phone)) {
        form.elements.telefone.setCustomValidity('Informe um WhatsApp válido com DDD.');
        form.elements.telefone.reportValidity();
        return;
      }
      if (!form.reportValidity()) return;
      const payload = Object.fromEntries(new FormData(form));
      const fingerprint = JSON.stringify(payload);
      if (lastFingerprint && fingerprint !== lastFingerprint) submissionId = crypto.randomUUID();
      lastFingerprint = fingerprint;
      const params = new URL(location.href).searchParams;
      payload.utm = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map(key => [key, params.get(key) || '']));
      Object.assign(payload, { id: submissionId, event_source_url: location.origin + location.pathname, fbp: cookie('_fbp'), fbc: cookie('_fbc') });
      saving = true;
      forms.forEach(item => { item.querySelector('[type="submit"]').disabled = true; });
      submit.textContent = 'Enviando seu projeto…';
      status.textContent = '';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('/api/leads', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin', body: JSON.stringify(payload), signal: controller.signal
        });
        const result = await response.json();
        if (!response.ok || !result.ok || !result.whatsapp_url?.startsWith('https://wa.me/')) throw new Error('delivery');
        completed = result;
        document.dispatchEvent(new CustomEvent('nexo:lead-saved', { detail: { eventId: submissionId } }));
        showSuccess(result.whatsapp_url);
        panel.querySelector('[data-whatsapp-continue]').focus();
        document.dispatchEvent(new CustomEvent('nexo:whatsapp-open'));
        location.assign(result.whatsapp_url);
      } catch {
        status.textContent = 'Não conseguimos enviar agora. Seus dados continuam aqui; tente novamente em instantes.';
      } finally {
        clearTimeout(timeout);
        saving = false;
        forms.forEach(item => { item.querySelector('[type="submit"]').disabled = false; });
        submit.innerHTML = 'Enviar e ir para o WhatsApp <span aria-hidden="true">↗</span>';
      }
    });
  });
})();
