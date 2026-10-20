importScripts('./hero-sequence-core.js?v=1');
if (typeof self.requestAnimationFrame !== 'function') {
  self.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 1000 / 60);
  self.cancelAnimationFrame = id => clearTimeout(id);
}
let renderer;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      renderer = new NexoSequenceRenderer(data.canvas, data.url,
        status => self.postMessage(status),
        data.audit ? sample => self.postMessage({type: 'sample', ...sample}) : null);
      renderer.resize(data.width, data.height, data.portrait);
      await renderer.init();
    } else if (data.type === 'resize') renderer.resize(data.width, data.height, data.portrait);
    else if (data.type === 'progress') renderer.setProgress(data.progress);
    else if (data.type === 'active') renderer.setActive(data.active);
  } catch { self.postMessage({type: 'error'}); }
};
