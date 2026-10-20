(() => {
  'use strict';
  const hero = document.querySelector('.nexo-hero');
  const video = hero?.querySelector('.nx-hero-film');
  if (!video) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = true, progress = 0, worker, renderer, canvas, started = false, fallback = false;
  let sizeKey = '', resizeFrame = 0, sourcePortrait = false;
  const allowed = () => !reduced.matches && !navigator.connection?.saveData && !!window.nexoHero?.enabled;
  const status = message => {
    if (message.type === 'ready') hero.classList.add('nx-sequence-ready');
    if (message.type === 'error') useVideo();
    if (message.type === 'quality' && canvas) {
      canvas.dataset.quality = message.level;
      canvas.dataset.frame = message.frame;
      canvas.dataset.sourceWidth = message.sourceWidth;
      canvas.dataset.sourceHeight = message.sourceHeight;
    }
  };
  function useVideo() {
    if (fallback) return;
    fallback = true;
    worker?.terminate(); renderer?.setActive(false);
    canvas?.remove(); hero.classList.remove('nx-sequence-ready');
    const script = document.createElement('script');
    script.src = './hero-video-fallback.js?v=1';
    script.onload = () => { window.nexoHeroVideo.setActive(active); window.nexoHeroVideo.paint(progress, innerWidth <= 700); };
    document.head.append(script);
  }
  function dimensions() {
    const {width, height} = hero.querySelector('.nx-stage').getBoundingClientRect();
    const portrait = innerWidth <= 700 && height > width;
    // Allocate the visible slice at screen density, up to the original 4K.
    const ratio = Math.min(devicePixelRatio || 1, 3, 3840 / width, 2160 / height);
    return {width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), portrait};
  }
  function send(message) {
    if (worker) worker.postMessage(message);
    else if (renderer) {
      if (message.type === 'progress') renderer.setProgress(message.progress);
      else if (message.type === 'active') renderer.setActive(message.active);
      else if (message.type === 'resize') renderer.resize(message.width, message.height, message.portrait);
    }
  }
  function resize() {
    resizeFrame = 0;
    if (!canvas || fallback) return;
    const size = dimensions(), key = JSON.stringify(size);
    if (size.portrait !== sourcePortrait) {
      worker?.terminate(); renderer?.setActive(false);
      worker = renderer = null; canvas.remove(); canvas = null;
      hero.classList.remove('nx-sequence-ready'); started = false;
      start(); return;
    }
    if (key !== sizeKey) { sizeKey = key; send({type: 'resize', ...size}); }
  }
  function queueResize() { if (!resizeFrame) resizeFrame = requestAnimationFrame(resize); }
  async function start() {
    if (started || fallback || !active || document.hidden || !allowed()) return;
    started = true;
    if (!window.NexoSequenceRenderer || typeof createImageBitmap !== 'function') { useVideo(); return; }
    canvas = document.createElement('canvas');
    canvas.className = 'nx-hero-sequence';
    canvas.setAttribute('aria-hidden', 'true');
    video.after(canvas);
    const size = dimensions(); sizeKey = JSON.stringify(size);
    sourcePortrait = size.portrait;
    const url = new URL(size.portrait ? video.dataset.sequenceMobile : video.dataset.sequence, location.href).href;
    try {
      if (canvas.transferControlToOffscreen && typeof Worker === 'function') {
        worker = new Worker('./hero-sequence-worker.js?v=1');
        worker.onmessage = ({data}) => status(data);
        worker.onerror = () => useVideo();
        const surface = canvas.transferControlToOffscreen();
        worker.postMessage({type: 'init', canvas: surface, url, ...size}, [surface]);
      } else {
        renderer = new NexoSequenceRenderer(canvas, url, status);
        renderer.resize(size.width, size.height, size.portrait);
        await renderer.init();
      }
      send({type: 'progress', progress});
    } catch { useVideo(); }
  }
  document.addEventListener('visibilitychange', () => {
    if (fallback) return;
    if (!document.hidden) start();
    send({type: 'active', active: active && !document.hidden && allowed()});
  });
  reduced.addEventListener('change', () => {
    if (fallback) return;
    if (!reduced.matches) start();
    send({type: 'active', active: active && !document.hidden && allowed()});
  });
  window.addEventListener('resize', queueResize, {passive: true});
  new ResizeObserver(queueResize).observe(hero.querySelector('.nx-stage'));
  window.nexoHeroVideo = {
    paint(value) {
      progress = Math.max(0, Math.min(1, value));
      if (active && !document.hidden && allowed()) { start(); send({type: 'progress', progress}); }
    },
    setActive(value) {
      active = value;
      if (active) start();
      send({type: 'active', active: active && !document.hidden && allowed()});
    }
  };
})();
