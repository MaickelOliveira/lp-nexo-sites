(() => {
  'use strict';
  const frameTime = (progress, duration, fps = 24) => {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const last = Math.max(0, Math.ceil(duration * fps) - 1);
    return Math.round(Math.max(0, Math.min(1, progress)) * last) / fps;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { frameTime };
  if (typeof document === 'undefined') return;
  const hero = document.querySelector('.nexo-hero');
  const video = hero?.querySelector('.nx-hero-film');
  if (!video) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let desired = 0, active = true, loaded = false, raf = 0;
  let awaitingFrame = false, presentationRaf = 0;
  let loadedUrl = '', loadVersion = 0;
  let playhead = null, lastTick = 0, mobile = false, lastPosition = '';
  const allowed = () => !reduced.matches && !navigator.connection?.saveData && window.nexoHero?.enabled;
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    if (presentationRaf) cancelAnimationFrame(presentationRaf);
    raf = 0;
    presentationRaf = 0;
    awaitingFrame = false;
    lastTick = 0;
  }
  function seek(now) {
    raf = 0;
    if (!active || document.hidden || !allowed() || video.readyState < 1 || !Number.isFinite(video.duration)) {
      lastTick = 0;
      return;
    }
    if (awaitingFrame || video.seeking) return;
    const target = frameTime(desired, video.duration);
    const dt = lastTick ? Math.min(50, now - lastTick) : 1000 / 60;
    lastTick = now;
    // A short, time-based catch-up absorbs wheel steps without changing native
    // page scrolling. Large navigation jumps do not create a long playback tail.
    if (playhead === null || Math.abs(target - playhead) > 1.25) playhead = target;
    else playhead += (target - playhead) * (1 - Math.exp(-dt / 65));
    if (Math.abs(target - playhead) < 1 / 96) playhead = target;
    const time = Math.round(playhead * 24) / 24;
    // Keep only the newest target and let each decoded frame reach the screen.
    // `seeked` alone does not mean the compositor has displayed that frame.
    if (Math.abs(video.currentTime - time) >= 1 / 48) {
      awaitingFrame = true;
      video.currentTime = time;
    }
    const progress = video.duration > 0 ? playhead / video.duration : 0;
    const position = mobile ? 67 - 17 * Math.min(progress / .4, 1) + 17 * Math.max(0, (progress - .75) / .25) : 50;
    const crop = `${position.toFixed(1)}% center`;
    if (crop !== lastPosition) { video.style.objectPosition = crop; lastPosition = crop; }
    if (playhead !== target) schedule();
    else lastTick = 0;
  }
  function schedule() { if (!raf && !awaitingFrame && !presentationRaf) raf = requestAnimationFrame(seek); }
  function presentFrame() {
    if (presentationRaf) cancelAnimationFrame(presentationRaf);
    if (!active || document.hidden || !allowed()) {
      awaitingFrame = false;
      presentationRaf = 0;
      return;
    }
    // Leave one rendering opportunity between decoding and the next seek.
    // Scroll updates during this interval replace the target without polling.
    presentationRaf = requestAnimationFrame(() => {
      presentationRaf = 0;
      awaitingFrame = false;
      schedule();
    });
  }
  async function load() {
    if (!active || document.hidden || !allowed()) return;
    // The mobile export follows the same moving crop at 1080 square pixels,
    // derived from the 4K master; landscape uses the full 3840 x 2160 film.
    const portrait = matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
    const url = portrait ? video.dataset.mobile : video.dataset.desktop;
    if (loaded && loadedUrl === url) return;
    loaded = true;
    loadedUrl = url;
    const version = ++loadVersion;
    video.muted = true;
    video.preload = 'auto';
    try {
      // The hosted asset endpoint may return 200 for byte-range requests.
      // A local Blob makes every forward/reverse seek independent of that server.
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Video unavailable');
      const blob = await response.blob();
      if (version !== loadVersion) return;
      const previous = video.src;
      stop();
      video.src = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
      if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
      primed = false;
      video.load();
      schedule();
    } catch {
      if (version !== loadVersion) return;
      stop();
      video.src = url;
      video.load();
    }
  }
  video.addEventListener('loadedmetadata', schedule);
  video.addEventListener('loadeddata', schedule);
  video.addEventListener('canplay', schedule);
  video.addEventListener('progress', schedule);
  // Safari/iOS may defer decoding until the first real gesture. Prime its
  // muted decoder once, then immediately pause and return to the scroll target.
  let primed = false;
  function prime() {
    if (primed || !allowed() || !active) return;
    load();
    if (!video.src) return;
    primed = true;
    const promise = video.play();
    if (promise?.then) promise.then(() => { video.pause(); schedule(); }).catch(() => { primed = false; });
  }
  for (const event of ['touchstart', 'pointerdown', 'wheel', 'keydown']) {
    window.addEventListener(event, prime, { passive: true });
  }
  video.addEventListener('seeked', presentFrame);
  video.addEventListener('error', () => {
    hero.classList.add('nx-video-error');
    document.dispatchEvent(new CustomEvent('nexo:layout'));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); playhead = null; }
    else { load(); schedule(); }
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) { stop(); playhead = null; }
    else { load(); schedule(); }
  });
  window.nexoHeroVideo = {
    paint(progress, isMobile) {
      desired = Math.max(0, Math.min(1, progress));
      mobile = isMobile;
      if (!active) return;
      load(); schedule();
    },
    setActive(value) {
      if (active === value) return;
      active = value;
      if (active) { load(); schedule(); }
      else { stop(); playhead = null; }
    },
    frameTime
  };
})();
