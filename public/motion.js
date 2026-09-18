(() => {
  'use strict';
  // Stateless interpolation: a scroll coordinate always produces the same frame,
  // whether reached by wheel, touch, keyboard, scrollbar, or reverse scrolling.
  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
  const range = (v, a, b) => clamp((v - a) / Math.max(b - a, 0.0001));
  const ease = v => { const p = clamp(v); return p * p * (3 - 2 * p); };
  const lerp = (a, b, p) => a + (b - a) * p;
  const entry = (top, vh, start = .94, end = .48) => ease(range(vh - top, vh * (1 - start), vh * (1 - end)));
  const intentFrame = p => Array.from({length:3},(_,i)=>ease(clamp(1-Math.abs(clamp(p)*2-i))));
  const intentProgress = (y,vh,m) => m.pinned ? range(y-m.top,0,Math.max(m.height-m.stageHeight,1)) : range(y+vh*.53,m.firstCenter,m.lastCenter);
  const intentHighlight = (p,rows) => {
    const position=clamp(p)*(rows.length-1),index=Math.floor(position);
    const a=rows[index],b=rows[Math.min(index+1,rows.length-1)],t=ease(position-index);
    return {top:lerp(a.top,b.top,t),height:lerp(a.height,b.height,t)};
  };
  const chapterFrame = (top,vh) => 1-ease(range(vh-top,0,vh*.65));
  const model = { clamp, range, ease, lerp, entry, intentFrame, intentProgress, intentHighlight, chapterFrame };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  if (typeof document === 'undefined') return;

  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 800px)');
  const short = matchMedia('(max-height: 739px)');
  const hero = $('.nexo-hero');
  const wordsRoot = $('.word-reveal');
  // Preserve the heading's original text and emphasis for assistive technology.
  if (wordsRoot) {
    wordsRoot.setAttribute('aria-label', wordsRoot.textContent);
    const wrapWords = parent => {
      [...parent.childNodes].forEach(node => {
        if (node.nodeType === 3) {
          const fragment = document.createDocumentFragment();
          node.textContent.split(/(\s+)/).forEach(part => {
            if (/^\s+$/.test(part)) fragment.append(document.createTextNode(part));
            else if (part) { const span = document.createElement('span'); span.className = 'word'; span.textContent = part; span.setAttribute('aria-hidden','true'); fragment.append(span); }
          });
          node.replaceWith(fragment);
        } else wrapWords(node);
      });
    };
    wrapWords(wordsRoot);
  }
  const words = all('.word-reveal .word');
  const values = all('.value-item');
  const steps = all('.method-step');
  const principles = all('.principle');
  const questions = all('.faq-list details');
  const panels = all('.case-browser').filter(el=>!el.closest('.portfolio-journey'));
  const reveals = all('.section-index, .heading-aside, .work-heading, .faq-heading, .case-details').filter(el=>!el.closest('.portfolio-journey'));
  const transitions = all('.scene-transition');
  const intentLines = all('.intent-line');
  const intentSticky = $('.intent-sticky');
  const motionLines = all('.motion-line');
  const sections = all('main > section');
  steps.forEach((step,i) => step.style.setProperty('--step-i',i));
  const tracked = [...new Set([hero, wordsRoot, ...values, ...steps, ...panels, ...reveals,
    $('.work'), $('.intent'), $('.method-list'), $('.difference-statement'), $('.principle-grid'),
    $('.faq'), ...questions, $('.contact'), $('.site-footer'), ...sections].filter(Boolean))];
  let metrics = new Map(), frame = 0, measuring = true;
  let intentMetrics, intentRows=[];

  // offsetTop is independent of transforms and sticky positioning. Caching these
  // coordinates avoids feeding a rendered transform into the following frame.
  function offsetTop(element) {
    let y = 0, el = element;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }
  function measure() {
    window.nexoHero?.configure(window.innerHeight);
    window.nexoPortfolio?.measure(window.innerHeight);
    metrics = new Map(tracked.map(el => [el, { top: offsetTop(el), height: el.offsetHeight }]));
    intentRows=intentLines.map(el=>({top:el.offsetTop,height:el.offsetHeight}));
    const trackTop=offsetTop($('.intent-track'));
    const first=intentRows[0],last=intentRows[intentRows.length-1];
    intentMetrics={...metrics.get($('.intent')),stageHeight:intentSticky.offsetHeight,
      pinned:getComputedStyle(intentSticky).position==='sticky',
      firstCenter:trackTop+first.top+first.height/2,lastCenter:trackTop+last.top+last.height/2};
    // Recover the cards' normal-flow coordinates even when a resize or FAQ toggle
    // occurs while a card is stuck. Sticky offsets must not shift the timeline.
    const list = $('.method-list');
    let stepTop = offsetTop(list) + parseFloat(getComputedStyle(list).paddingTop || 0);
    steps.forEach(el => {
      const style = getComputedStyle(el);
      stepTop += parseFloat(style.marginTop || 0);
      metrics.set(el,{top:stepTop,height:el.offsetHeight});
      stepTop += el.offsetHeight + parseFloat(style.marginBottom || 0);
    });
    measuring = false;
  }
  const transform = (el, value) => { if (el) el.style.transform = value; };
  const set = (el, key, value) => { if (el) el.style.setProperty(key,value); };
  function opacity(el,value) { if (el) el.style.opacity = String(value); }
  function actionable(el, shown) {
    if (!el) return;
    // Offstage controls must not receive keyboard focus. Never steal existing focus.
    el.inert = !shown;
    el.style.visibility = shown ? 'visible' : 'hidden';
  }
  function update() {
    frame = 0;
    if (measuring) measure();
    const y = window.scrollY, vh = window.innerHeight;
    const mobile = compact.matches, motion = !reduced.matches;
    const top = el => (metrics.get(el)?.top || 0) - y;
    const progress = el => {
      const m = metrics.get(el);
      return m ? clamp((y + vh - m.top) / (m.height + vh)) : 0;
    };
    const heroController = window.nexoHero;
    const hp = heroController?.enabled ? range(y-(metrics.get(hero)?.top||0),0,Math.max(hero.offsetHeight-heroController.stageHeight,1)) : 0;
    heroController?.paint(hp,window.innerWidth<=700);
    window.nexoPortfolio?.paint(y);

    // Header contrast follows the surface under it, including reverse traversal.
    let currentSection = hero;
    for (const section of sections) if (top(section) <= 85) currentSection = section;
    $('.site-header')?.classList.toggle('is-light',currentSection?.dataset.tone === 'light');
    reveals.forEach(el => {
      const p = motion ? entry(top(el),vh) : 1;
      opacity(el,lerp(.28,1,p));
      transform(el,`translate3d(0,${(1-p)*42}px,0)`);
      if(el.classList.contains('section-index')) set(el,'--index-progress',p);
    });
    transitions.forEach(el=>set(el,'--cap-scale',motion?chapterFrame(top(el),vh):0));
    const wordProgress = motion ? range(vh - top(wordsRoot),vh*.25,vh*.85) : 1;
    words.forEach((word,i) => set(word,'--word-o',lerp(.16,1,ease(range(wordProgress,i/words.length,(i+1.4)/words.length)))));
    values.forEach((el,i) => {
      const p = motion ? entry(top(el),vh,.99,.43-i*.055) : 1;
      transform(el,`perspective(1100px) translate3d(0,${(1-p)*(80+i*23)}px,0) rotateX(${(1-p)*12}deg)`);
      opacity(el,lerp(.3,1,p));
    });
    const wp = progress($('.work'));
    transform($('.work-ribbon'),motion ? `translateX(${-wp*(mobile?360:750)}px)` : 'none');
    panels.forEach(el => {
      if (el.closest('[hidden]')) return;
      const p = motion ? entry(top(el),vh,.95,.24) : 1;
      set(el,'--case-y',`${(1-p)*45}px`); set(el,'--case-r',`${(1-p)*18}deg`); set(el,'--case-s',lerp(.84,1,p));
    });
    const intent = $('.intent');
    const ip = motion ? intentProgress(y,vh,intentMetrics) : .5;
    const intentEntry = motion ? entry(top(intent),vh,1,.12) : 1;
    const intentStates = intentFrame(ip);
    intentLines.forEach((el,i)=>{
      const side=i%2===0?-1:1;
      transform(el,`translate3d(${motion?(1-intentEntry)*side*(mobile?22:90):0}px,0,0)`);
      opacity(el,motion?lerp(.64,1,intentStates[i]):1);
    });
    const band=intentHighlight(ip,intentRows);
    transform($('.intent-highlight'),`translate3d(0,${band.top}px,0)`);
    set($('.intent-highlight'),'height',band.height+'px');
    set(intent,'--intent-progress',motion?ip:1);
    let activeStep = 0;
    steps.forEach((el,i) => {
      const m = metrics.get(el), before = m.top-y;
      const next = steps[i+1] && metrics.get(steps[i+1]);
      if (before < vh*.6) activeStep = i;
      const overlap = motion && !short.matches && next ? ease(range(y + 155 + i*16 - next.top,-vh*.22,50)) : 0;
      const enter = motion ? entry(before,vh,.99,.52) : 1;
      transform(el,`perspective(1300px) translateY(${(1-enter)*48}px) scale(${1-overlap*.055}) rotateX(${-overlap*3}deg)`);
      // Keep stacked text readable until the next card physically covers it.
      el.style.filter = motion ? `brightness(${1-overlap*.17})` : 'none';
    });
    const counter = $('[data-method-number]');
    if (counter) counter.textContent = String(activeStep+1).padStart(2,'0');
    set($('.method-counter'),'--method-progress',(activeStep+1)/4);
    const difference = $('.difference-statement');
    const dp = motion ? entry(top(difference),vh,.98,.38) : 1;
    transform(difference,`translate3d(0,${(1-dp)*60}px,0) scale(${lerp(.9,1,dp)})`);
    opacity(difference,lerp(.3,1,dp));
    motionLines.forEach((el,i)=>transform(el,`translateX(${motion?(1-dp)*(i%2===0?-1:1)*(mobile?25:105):0}px)`));
    const fan = motion ? entry(top($('.principle-grid')),vh,.99,.28) : 1;
    principles.forEach((el,i) => {
      const side = i-1;
      const x = mobile ? side*(1-fan)*20 : -side*(1-fan)*160;
      const angle = mobile ? side*(1-fan)*5 : side*(1-fan)*19;
      transform(el,`translate3d(${x}px,${(1-fan)*(i===1?0:75)}px,0) rotate(${angle}deg)`);
    });
    const fp = motion ? progress($('.faq')) : .5;
    transform($('.faq-symbol'),`rotate(${(fp-.5)*35}deg) translateY(${(fp-.5)*-90}px)`);
    questions.forEach((el,i) => {
      const p = motion ? entry(top(el),vh,.99,.65) : 1;
      transform(el,`translateX(${(1-p)*(30+i*8)}px)`);
      opacity(el,lerp(.35,1,p));
    });
    const contact = $('.contact'), ct = top(contact);
    const cp = motion ? ease(range(vh-ct,0,vh*.65)) : 1;
    set(contact,'--contact-radius',`${lerp(20,150,cp)}%`);
    transform($('.contact-main'),`translateX(${motion ? (1-cp)*-60 : 0}px)`);
    transform($('.contact-circle'),`rotate(${motion ? (1-cp)*-75 : 0}deg)`);
    transform($('.contact-bottom'),`translateX(${motion ? (1-cp)*40 : 0}px)`);
    const footerP = motion ? entry(top($('.site-footer')),vh,1,.7) : 1;
    transform($('.footer-top'),`translateY(${(1-footerP)*45}px)`);
  }
  function schedule(remeasure = false) {
    if (remeasure) measuring = true;
    if (!frame) frame = requestAnimationFrame(update);
  }
  function configure() {
    root.classList.toggle('motion-ready',!reduced.matches);
    schedule(true);
  }
  // Native scrolling remains untouched; only a single paint is requested per frame.
  window.addEventListener('scroll',() => {
    schedule();
  },{passive:true});
  window.addEventListener('resize',() => schedule(true),{passive:true});
  window.addEventListener('load',() => schedule(true));
  window.addEventListener('pageshow',() => schedule(true));
  document.addEventListener('nexo:layout',() => schedule(true));
  document.addEventListener('nexo:motion',() => schedule());
  document.addEventListener('visibilitychange',() => { if (!document.hidden) schedule(true); });
  reduced.addEventListener('change',configure);
  compact.addEventListener('change',() => schedule(true));
  short.addEventListener('change',() => schedule(true));
  if ('ResizeObserver' in window) new ResizeObserver(() => schedule(true)).observe(document.body);
  document.fonts?.ready.then(() => schedule(true));
  configure();
})();
