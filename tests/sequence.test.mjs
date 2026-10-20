import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile, stat} from 'node:fs/promises';
const source = await readFile('public/hero-sequence-core.js', 'utf8');
function harness() {
  const callbacks = new Map(), draws = [], closed = [];
  let serial = 0;
  const context = {module: {exports: {}}, URL, Blob, AbortController, Date,
    setTimeout: () => 1, clearTimeout() {},
    performance: {now: () => 0},
    requestAnimationFrame: callback => {callbacks.set(++serial, callback); return serial;},
    cancelAnimationFrame: id => callbacks.delete(id),
    fetch: async () => {throw new Error('Unexpected network request');},
    createImageBitmap: async () => ({close() {closed.push('decoded');}})};
  vm.runInNewContext(source, context);
  const {SequenceRenderer, frameAt, cropAt} = context.module.exports;
  const canvas = {getContext: () => ({drawImage: (...args) => draws.push(args), globalAlpha: 1})};
  const renderer = new SequenceRenderer(canvas, 'https://nexo.test/manifest.json');
  renderer.meta = {frames: 384, cutFrames: [192], levels: {preview: {groups: []}}};
  renderer.width = 1080; renderer.height = 2160; renderer.portrait = true;
  renderer.pump = () => {};
  const image = (frame, level = 'high', bytes = 1024) => {
    const key = `${level}:${frame}`;
    const bitmap = {close() {closed.push(key);}};
    const item = {key, frame, level, bytes, bitmap};
    renderer.images.set(key, item); renderer.imageBytes += bytes;
    return item;
  };
  const tick = now => {const batch = [...callbacks.values()]; callbacks.clear(); for (const callback of batch) callback(now);};
  return {renderer, frameAt, cropAt, callbacks, draws, closed, image, tick};
}
test('sequence maps scroll to fractional frames and retraces exactly, including both endpoints', () => {
  const {frameAt} = harness();
  assert.equal(frameAt(0), 0); assert.equal(frameAt(1), 383);
  assert.equal(frameAt(.5), 191.5);
  assert.equal(frameAt(-3), 0); assert.equal(frameAt(9), 383);
  const forward = Array.from({length: 101}, (_, i) => frameAt(i / 100));
  for (let i = 100; i >= 0; i--) assert.equal(frameAt(i / 100), forward[i]);
});
test('portrait crop preserves original image height and stays inside the 4K source', () => {
  const {cropAt} = harness();
  for (const aspect of [320/844, 407/845, 700/900, 16/9, 21/9]) {
    for (const frame of [0, 120, 192, 300, 383]) {
      const crop = cropAt(3840, 2160, aspect, frame, 384, aspect < 1);
      assert.ok(crop.sx >= 0 && crop.sy >= 0);
      assert.ok(crop.sx + crop.sw <= 3840 && crop.sy + crop.sh <= 2160);
      if (aspect < 16/9) assert.equal(crop.sh, 2160);
    }
  }
});
test('renderer blends neighboring frames, avoids blending across the clip cut, and idles after settling', () => {
  const h = harness(), r = h.renderer;
  h.image(100); h.image(101);
  r.target = r.position = 100.5; r.schedule(); h.tick(16);
  assert.equal(h.draws.length, 2);
  assert.equal(h.callbacks.size, 0);
  r.position = r.target = 191.5; h.image(191); h.image(192); r.schedule(); h.tick(32);
  assert.equal(h.draws.length, 3, 'the clip boundary must remain a cut');
});
test('large scroll jumps and reversals discard intermediate destinations', () => {
  const h = harness(), r = h.renderer;
  r.setProgress(.9); r.setProgress(.1);
  assert.equal(r.position, h.frameAt(.1));
  assert.equal(h.callbacks.size, 1);
  assert.equal(r.direction, -1);
  h.image(38); h.image(39); h.tick(16);
  assert.equal(h.draws.length, 2);
});
test('cache closes obsolete textures, bounds 4K lookahead and releases all decoded frames offscreen', () => {
  const h = harness(), r = h.renderer;
  r.width = 3840; r.height = 2160; r.portrait = false;
  r.position = r.target = 100.5;
  const required = r.candidates();
  assert.ok(required.filter(item => item.level === 'high').length <= 3);
  h.image(0, 'high', 3840*2160*4);
  h.image(100, 'high', 3840*2160*4);
  h.image(101, 'high', 3840*2160*4);
  r.trim(); assert.ok(h.closed.includes('high:0'));
  r.schedule(); r.setActive(false);
  assert.equal(r.images.size, 0); assert.equal(r.imageBytes, 0);
  assert.equal(h.callbacks.size, 0);
});
test('rotation drops textures from the old canvas dimensions', () => {
  const h = harness(), r = h.renderer;
  h.image(0); r.resize(2560, 1440, false);
  assert.equal(r.images.size, 0); assert.ok(h.closed.includes('high:0'));
  assert.equal(r.canvas.width, 2560); assert.equal(r.canvas.height, 1440);
});
test('uncached high-resolution frames wait for scrolling to settle, while motion previews stay available', () => {
  const {renderer: r} = harness();
  r.setProgress(.2);
  const moving = r.candidates();
  assert.equal(moving.filter(item => item.level === 'high').length, 0);
  assert.ok(moving.some(item => item.level === 'preview'));
  r.lastInputAt = -Infinity;
  assert.ok(r.candidates().some(item => item.level === 'high'));
});
test('mobile lookahead accounts for both preview and full-resolution texture memory', () => {
  const {renderer: r, cropAt} = harness();
  r.meta.levels.preview.width = 720; r.meta.levels.preview.height = 1080;
  r.position = r.target = 100;
  const items = r.candidates();
  const previewCrop = cropAt(720, 1080, .5, 100, 384, true);
  const bytes = items.reduce((total, item) => total + (item.level === 'high' ? 1080*2160*4 : previewCrop.sw*previewCrop.sh*4), 0);
  assert.ok(bytes <= 64 * 1024 ** 2, 'the requested working set must fit, without eviction/decode churn');
});
test('both sequences contain 384 complete frames and the mobile crop retains 2160 pixels in height', async () => {
  for (const [directory, width] of [['v1', 3840], ['mobile-v1', 1440]]) {
    const root = `public/assets/hero-sequence/${directory}`;
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
    assert.equal(manifest.width, width); assert.equal(manifest.height, 2160);
    for (const [name, level] of Object.entries(manifest.levels)) {
      let totalFrames = 0;
      for (const group of level.groups) {
        const size = (await stat(`${root}/${group.file}`)).size;
        assert.equal(group.offsets[0], 0);
        assert.equal(group.offsets.at(-1), size);
        assert.ok(size < 25 * 1024 ** 2);
        for (let i = 1; i < group.offsets.length; i++) assert.ok(group.offsets[i] > group.offsets[i-1]);
        totalFrames += group.offsets.length - 1;
      }
      assert.equal(totalFrames, 384, `${directory}/${name}`);
    }
  }
});
