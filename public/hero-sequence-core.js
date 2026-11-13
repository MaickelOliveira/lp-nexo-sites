/* Independent frames: scrolling never waits for a video seek. */
(() => {
  'use strict';
  const frameAt = (progress, count = 384) => Math.max(0, Math.min(1, progress || 0)) * (count - 1);
  function cropAt(width, height, aspect, frame, count, portrait) {
    const sw = Math.min(width, height * aspect), sh = Math.min(height, width / aspect);
    const progress = frame / Math.max(1, count - 1);
    const position = portrait ? .67 - .17 * Math.min(progress / .4, 1) + .17 * Math.max(0, (progress - .75) / .25) : .5;
    return {sx: Math.round((width - sw) * position), sy: Math.round((height - sh) / 2), sw: Math.round(sw), sh: Math.round(sh)};
  }
  class SequenceRenderer {
    constructor(canvas, manifestUrl, notify = () => {}, onDraw = null) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', {alpha: false, desynchronized: true});
      // Decoding is what limits a fast scroll: use half the cores, at least 2 and at most 4.
      this.maxJobs = Math.max(2, Math.min(4, (typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4) >> 1));
      this.manifestUrl = manifestUrl;
      this.notify = notify;
      this.onDraw = onDraw;
      this.target = this.position = 0;
      this.direction = 1;
      this.active = true;
      this.images = new Map();
      this.packs = new Map();
      this.fetches = new Map();
      this.decoding = new Set();
      this.failures = new Map();
      this.imageBytes = this.packBytes = this.jobs = this.raf = this.epoch = 0;
      this.width = this.height = 0;
      this.lastTick = 0;
      this.lastInputAt = -Infinity;
      this.settleTimer = 0;
      this.lastKey = '';
      this.ready = false;
    }
    async init() {
      if (!this.ctx) throw new Error('Canvas unavailable');
      const response = await fetch(this.manifestUrl);
      if (!response.ok) throw new Error('Sequence unavailable');
      this.meta = await response.json();
      if (this.meta.frames !== 384 || !this.meta.levels?.high || !this.meta.levels?.preview) throw new Error('Invalid sequence');
      this.base = new URL('.', this.manifestUrl).href;
      this.schedule();
      this.pump();
    }
    resize(width, height, portrait) {
      width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
      if (width === this.width && height === this.height && portrait === this.portrait) return;
      this.width = this.canvas.width = width;
      this.height = this.canvas.height = height;
      this.portrait = portrait;
      this.epoch++;
      this.clearImages();
      this.lastKey = '';
      this.schedule(); this.pump();
    }
    setProgress(progress) {
      const target = frameAt(progress, this.meta?.frames || 384);
      if (target !== this.target) {
        this.direction = target > this.target ? 1 : -1;
        this.lastInputAt = performance.now();
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => { this.settleTimer = 0; this.pump(); }, 100);
      }
      this.target = target;
      // Only a real jump (anchor link, scrollbar drag) skips ahead; scrolling glides.
      if (Math.abs(this.position - target) > 96) this.position = target;
      this.schedule(); this.pump();
    }
    setActive(active) {
      if (this.active === active) return;
      this.active = active;
      this.lastTick = 0;
      if (!active) {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        clearTimeout(this.settleTimer); this.settleTimer = 0;
        this.epoch++;
        this.clearImages();
        for (const task of this.fetches.values()) task.controller.abort();
      } else {
        this.position = this.target;
        this.lastKey = '';
        this.schedule(); this.pump();
      }
    }
    clearImages() {
      for (const image of this.images.values()) image.bitmap.close();
      this.images.clear(); this.imageBytes = 0;
    }
    schedule() {
      if (!this.raf && this.active && this.meta && this.width) this.raf = requestAnimationFrame(now => this.tick(now));
    }
    tick(now) {
      this.raf = 0;
      if (!this.active) return;
      const dt = this.lastTick ? Math.min(50, now - this.lastTick) : 1000 / 60;
      this.lastTick = now;
      // Enough inertia to fuse separate mouse-wheel notches into one continuous move.
      this.position += (this.target - this.position) * (1 - Math.exp(-dt / 150));
      if (Math.abs(this.target - this.position) < .005) this.position = this.target;
      const first = Math.floor(this.position), second = Math.min(first + 1, this.meta.frames - 1);
      let a = this.image(first), b = this.image(second);
      let mix = this.position - first;
      // The join between the two approved clips is a cut, not a dissolve.
      if (this.meta.cutFrames?.includes(second)) { b = a; mix = 0; }
      if (!a) { a = b || this.nearest(first); mix = 0; }
      if (!b) mix = 0;
      const key = a ? `${a.key}:${b?.key}:${Math.round(mix * 128)}` : '';
      if (a && key !== this.lastKey) {
        const start = performance.now();
        this.ctx.globalAlpha = 1;
        this.ctx.drawImage(a.bitmap, 0, 0, this.width, this.height);
        if (b && mix > 0) {
          this.ctx.globalAlpha = mix;
          this.ctx.drawImage(b.bitmap, 0, 0, this.width, this.height);
          this.ctx.globalAlpha = 1;
        }
        this.lastKey = key;
        if (!this.ready) { this.ready = true; this.notify({type: 'ready'}); }
        const qualityKey = `${a.level}:${this.position === this.target ? Math.round(this.position) : 'moving'}`;
        if (qualityKey !== this.lastQualityKey) {
          this.lastQualityKey = qualityKey;
          const level = this.meta.levels[a.level];
          this.notify({type: 'quality', level: a.level, frame: a.frame, sourceWidth: level?.width, sourceHeight: level?.height});
        }
        this.onDraw?.({frame: this.position, sourceFrame: a.frame, target: this.target, level: a.level, drawMs: performance.now() - start, now, imageBytes: this.imageBytes, packBytes: this.packBytes});
      }
      this.pump();
      if (this.position !== this.target) this.schedule();
      else this.lastTick = 0;
    }
    image(frame) { return this.images.get(`high:${frame}`) || this.images.get(`preview:${frame}`); }
    nearest(frame) {
      let best = null, distance = 13;
      for (const image of this.images.values()) {
        const value = Math.abs(image.frame - frame);
        if (value < distance) { best = image; distance = value; }
      }
      return best;
    }
    candidates() {
      const result = [], seen = new Set(), last = this.meta.frames - 1;
      const previewLimit = this.portrait ? 12 : 20;
      let previewCount = 0;
      const add = (level, frame) => {
        frame = Math.max(0, Math.min(last, frame));
        const key = `${level}:${frame}`;
        if (!seen.has(key) && (level !== 'preview' || previewCount < previewLimit)) {
          seen.add(key); result.push({key, level, frame});
          if (level === 'preview') previewCount++;
        }
      };
      const current = Math.floor(this.position), target = Math.floor(this.target);
      const lag = Math.abs(target - current), trailing = lag > 5;
      // A picture trailing a fast scroll passes its current frame before a decode
      // of it could finish, so that work goes to the frames ahead instead.
      for (const frame of trailing ? [target, target + 1] : [target, target + 1, current, current + 1]) add('preview', frame);
      if (trailing) {
        // About ten frames spread over the gap: decoding every frame cannot keep
        // up with a fast scroll. Powers of two keep the grid stable as the gap closes.
        const way = Math.sign(target - current), step = 2 ** Math.ceil(Math.log2(lag / 10));
        const first = way > 0 ? Math.ceil((current + 1) / step) * step : Math.floor((current - 1) / step) * step;
        for (let frame = first; (target - frame) * way > 0; frame += way * step) add('preview', frame);
      }
      const budget = (this.portrait ? 64 : 160) * 1024 ** 2;
      const preview = this.meta.levels.preview;
      const previewCrop = cropAt(preview.width || 960, preview.height || 540, this.width / this.height, target, this.meta.frames, this.portrait);
      const reserve = previewLimit * Math.min(this.width * this.height, previewCrop.sw * previewCrop.sh) * 4 + 4 * 1024 ** 2;
      const highSlots = Math.max(2, Math.min(6, Math.floor((budget - reserve) / (this.width * this.height * 4))));
      let highCount = 0;
      // Refine only once the light frames around the current position are in hand, not the whole track.
      const here = Math.floor(target / preview.groupSize);
      const previewComplete = [here - 1, here, here + 1].every(i => !preview.groups[i] || this.packs.has(preview.groups[i].file));
      const high = frame => {
        frame = Math.max(0, Math.min(last, frame));
        const key = `high:${frame}`;
        const group = this.meta.levels.high?.groups[Math.floor(frame / this.meta.levels.high.groupSize)];
        // Keep network and decode capacity available for motion. Refine after
        // the scroll settles; already cached full-resolution packs remain usable.
        // A 4K decode started mid-glide starves the preview frames and reads as a hitch.
        const moving = performance.now() - this.lastInputAt < 180 || Math.abs(this.target - this.position) > .5;
        if (moving || !previewComplete) return;
        if (highCount < highSlots && !seen.has(key)) { add('high', frame); highCount++; }
      };
      for (const frame of [target, target + 1, current, current + 1]) high(frame);
      for (let offset = 1; offset <= 10; offset++) {
        add('preview', target + this.direction * offset);
        if (offset <= 3) high(target + this.direction * (offset + 1));
        if (offset <= 5) add('preview', target - this.direction * offset);
      }
      return result;
    }
    pump() {
      if (!this.active || !this.meta || !this.width) return;
      const now = Date.now();
      const next = this.candidates().filter(item => !this.images.has(item.key) && !this.decoding.has(item.key) && !(this.failures.get(item.key) > now));
      while (this.jobs < this.maxJobs && next.length) this.decode(next.shift());
      // Cache the small preview track for immediate jumps and direction changes.
      // Full-resolution packs are requested only around the current position.
      if (this.fetches.size < 3) {
        const level = this.meta.levels.preview;
        const origin = Math.floor(this.target / level.groupSize);
        const groups = level.groups.map((group, index) => ({group, index})).sort((a, b) => Math.abs(a.index - origin) - Math.abs(b.index - origin));
        const missing = groups.find(({group}) => !this.packs.has(group.file) && !this.fetches.has(group.file) && !(this.failures.get(group.file) > now));
        if (missing) this.pack(missing.group).catch(() => {});
      }
    }
    async pack(group) {
      if (this.packs.has(group.file)) {
        const blob = this.packs.get(group.file);
        this.packs.delete(group.file); this.packs.set(group.file, blob);
        return blob;
      }
      if (this.fetches.has(group.file)) return this.fetches.get(group.file).promise;
      const controller = new AbortController();
      const promise = (async () => {
        try {
          const response = await fetch(new URL(group.file, this.base), {signal: controller.signal});
          if (!response.ok) throw new Error('Frame pack unavailable');
          const blob = await response.blob();
          if (blob.size !== group.offsets.at(-1)) throw new Error('Incomplete frame pack');
          this.packs.set(group.file, blob); this.packBytes += blob.size;
          const budget = 40 * 1024 ** 2;
          for (const [key, old] of this.packs) {
            if (this.packBytes <= budget) break;
            // Keep the compact preview track for immediate jumps in either direction.
            if (key.startsWith('preview')) continue;
            this.packs.delete(key); this.packBytes -= old.size;
          }
          return blob;
        } catch (error) {
          if (error.name !== 'AbortError') this.failures.set(group.file, Date.now() + 5000);
          throw error;
        } finally {
          this.fetches.delete(group.file);
          this.pump();
        }
      })();
      this.fetches.set(group.file, {promise, controller});
      return promise;
    }
    async decode(item) {
      this.jobs++; this.decoding.add(item.key);
      const epoch = this.epoch;
      try {
        const level = this.meta.levels[item.level];
        const group = level.groups[Math.floor(item.frame / level.groupSize)];
        if (this.failures.get(group.file) > Date.now()) throw new Error('Pack temporarily unavailable');
        const pack = await this.pack(group);
        if (epoch !== this.epoch || !this.active) return;
        // A fast jump supersedes old decode work before it allocates a texture.
        if (item.frame < Math.min(this.target, this.position) - 16 || item.frame > Math.max(this.target, this.position) + 16) return;
        const local = item.frame - group.start;
        const blob = pack.slice(group.offsets[local], group.offsets[local + 1], 'image/webp');
        const crop = cropAt(level.width, level.height, this.width / this.height, item.frame, this.meta.frames, this.portrait);
        const scale = Math.min(1, this.width / crop.sw, this.height / crop.sh);
        const width = Math.max(1, Math.round(crop.sw * scale)), height = Math.max(1, Math.round(crop.sh * scale));
        // Asking for a resize to the same size still costs about a third of the decode time.
        const bitmap = scale < 1
          ? await createImageBitmap(blob, crop.sx, crop.sy, crop.sw, crop.sh, {resizeWidth: width, resizeHeight: height, resizeQuality: 'high'})
          : await createImageBitmap(blob, crop.sx, crop.sy, crop.sw, crop.sh);
        if (epoch !== this.epoch || !this.active) { bitmap.close(); return; }
        const image = {...item, bitmap, bytes: width * height * 4};
        this.images.set(item.key, image); this.imageBytes += image.bytes;
        this.trim(); this.schedule();
      } catch (error) {
        if (error.name !== 'AbortError') this.failures.set(item.key, Date.now() + 5000);
      } finally {
        this.jobs--; this.decoding.delete(item.key);
        this.pump();
      }
    }
    trim() {
      const budget = (this.portrait ? 64 : 160) * 1024 ** 2;
      const wanted = new Set(this.candidates().map(item => item.key));
      const distance = image => Math.min(Math.abs(image.frame - this.position), Math.abs(image.frame - this.target));
      const candidates = [...this.images.values()].sort((a, b) => distance(b) - distance(a) || (a.level === 'high' ? -1 : 1));
      for (const image of candidates) {
        if (wanted.has(image.key) && distance(image) <= 1) continue;
        // Frames between the picture and its target are about to be shown.
        const tooFar = !wanted.has(image.key) && (image.frame < Math.min(this.target, this.position) || image.frame > Math.max(this.target, this.position));
        if (!tooFar && this.imageBytes <= budget) continue;
        this.images.delete(image.key); this.imageBytes -= image.bytes; image.bitmap.close();
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {frameAt, cropAt, SequenceRenderer};
  else self.NexoSequenceRenderer = SequenceRenderer;
})();
