(() => {
  'use strict';
  const clamp = v => Math.max(0, Math.min(1, v));
  const range = (v, a, b) => clamp((v-a)/Math.max(b-a,1e-6));
  const smooth = p => p*p*(3-2*p);
  // Each project has time for its cover, a readable traversal of all its copy,
  // and an overlap with the next cover. Frames depend only on scroll position.
  function timeline(heights, viewport, screen) {
    let total = 0;
    const chapters = heights.map(height => {
      const overflow = Math.max(0,height-viewport);
      const duration = Math.max(screen*1.65,overflow+screen*1.1);
      const chapter = {start:total,duration,overflow};
      total += duration;
      return chapter;
    });
    return {chapters,total};
  }
  function frameAt(distance, story) {
    const d = Math.max(0,Math.min(story.total,distance));
    let index = story.chapters.findIndex(c => d < c.start+c.duration);
    if(index < 0) index = story.chapters.length-1;
    const c = story.chapters[index], p = clamp((d-c.start)/c.duration);
    const transition = index < story.chapters.length-1 ? smooth(range(p,.84,1)) : 0;
    return {index,p,pan:c.overflow*range(p,.16,.72),transition,
      active:index+(transition >= .5 ? 1 : 0),progress:clamp(d/story.total)};
  }
  const model = {timeline,frameAt};
  if(typeof module !== 'undefined' && module.exports) module.exports = model;
  if(typeof document === 'undefined') return;

  const $ = s => document.querySelector(s);
  const all = s => [...document.querySelectorAll(s)];
  const journey = $('.portfolio-journey');
  if(!journey) return;
  const viewport = journey.querySelector('.work-panels');
  const panels = all('[data-service-panel]');
  const choices = all('[data-service-tab]');
  // Preload covers shortly before the section, instead of competing with hero assets.
  const preload=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){
      panels.forEach(panel=>panel.querySelectorAll('img').forEach(img=>{img.loading='eager';}));
      preload.disconnect();
    }
  },{rootMargin:'1200px'});
  preload.observe(journey);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const currentName = $('[data-project-current]');
  const currentCount = $('[data-project-count]');
  const currentLink = $('[data-project-external]');
  const liveStatus = $('[data-project-status]');
  const offset = element => {
    let y=0;
    for(let el=element;el;el=el.offsetParent) y+=el.offsetTop;
    return y;
  };
  let enabled=false, story, start=0, top=0, height=0, active=-1,viewHeight=0,lastDistance=null;
  let links=[], naturalTops=[];
  const styles=new WeakMap(), interactiveState=new WeakMap();
  const set=(el,key,value)=>{
    let cache=styles.get(el);
    if(!cache){cache=new Map();styles.set(el,cache);}
    const text=String(value);
    if(cache.get(key)===text)return;
    cache.set(key,text);el.style.setProperty(key,text);
  };
  const setActive = index => {
    if(active===index) return;
    active=index;
    choices.forEach((choice,i)=>{
      choice.classList.toggle('is-active',i===index);
      if(i===index) choice.setAttribute('aria-current','step');
      else choice.removeAttribute('aria-current');
    });
    currentName.textContent=choices[index].dataset.projectName;
    currentCount.textContent=String(index+1).padStart(2,'0');
    currentLink.href=panels[index].querySelector('a[target="_blank"]').href;
    currentLink.setAttribute('aria-label','Conhecer a página de '+choices[index].dataset.projectName);
    liveStatus.textContent=`Projeto ${index+1} de ${panels.length}: ${choices[index].dataset.projectName}.`;
  };
  function measure(vh) {
    lastDistance=null;
    top=$('.site-header').offsetHeight+16;
    height=vh-top-22;
    enabled=!reduced.matches && vh>=560 && height>=420;
    journey.classList.toggle('portfolio-pinned',enabled);
    journey.style.setProperty('--portfolio-top',top+'px');
    journey.style.setProperty('--portfolio-height',height+'px');
    if(enabled) {
      viewHeight=viewport.clientHeight;
      story=timeline(panels.map(p=>p.offsetHeight),viewHeight,vh);
      journey.style.height=story.total+height+'px';
      start=offset(journey)-top;
      links=panels.map(panel=>[...panel.querySelectorAll('a')].map(el=>({
        el,top:offset(el)-offset(panel),bottom:offset(el)-offset(panel)+el.offsetHeight
      })));
    } else {
      journey.style.removeProperty('height');
      naturalTops=panels.map(offset);
      panels.forEach(panel=>{
        styles.delete(panel);interactiveState.delete(panel);
        panel.inert=false;
        panel.removeAttribute('aria-hidden');
        ['transform','opacity','visibility','clip-path','z-index','will-change'].forEach(p=>panel.style.removeProperty(p));
        panel.querySelectorAll('a').forEach(el=>el.removeAttribute('tabindex'));
      });
    }
  }
  function paint(y) {
    if(!story && enabled) return;
    if(!enabled) {
      const center=y+window.innerHeight*.48;
      let index=0;
      naturalTops.forEach((t,i)=>{if(t<=center) index=i;});
      setActive(index);
      return;
    }
    const distance=Math.max(0,Math.min(story.total,y-start));
    if(distance===lastDistance)return;
    lastDistance=distance;
    const f=frameAt(distance,story);
    setActive(f.active);
    set(journey,'--portfolio-progress',f.progress);
    choices.forEach((choice,i)=>{
      const value=i<f.index?1:i===f.index?f.p:0;
      set(choice,'--chapter-progress',value);
    });
    panels.forEach((panel,i)=>{
      const outgoing=i===f.index;
      const incoming=i===f.index+1 && f.transition>0;
      const shown=outgoing||incoming;
      const interactive=i===f.active;
      if(interactiveState.get(panel)!==interactive){
        interactiveState.set(panel,interactive);panel.inert=!interactive;
        if(interactive) panel.removeAttribute('aria-hidden');
        else panel.setAttribute('aria-hidden','true');
      }
      set(panel,'visibility',shown?'visible':'hidden');
      // Keep only the currently presented covers promoted to graphics layers.
      set(panel,'will-change',shown?'transform,opacity,clip-path':'auto');
      if(!shown) return;
      const pan=outgoing?f.pan:0;
      set(panel,'z-index',incoming?'2':'1');
      set(panel,'opacity',outgoing?1-f.transition*.6:1);
      set(panel,'clip-path',incoming?`inset(0 0 0 ${(1-f.transition)*100}%)`:'none');
      set(panel,'transform',`translate3d(${incoming?(1-f.transition)*36:-f.transition*36}px,${-pan}px,0)`);
      // Keyboard navigation stays within the portion of the project on screen.
      links[i].forEach(link=>{
        const visible=interactive&&link.top-pan>=0&&link.bottom-pan<=viewHeight;
        if(link.visible!==visible){link.visible=visible;link.el.tabIndex=visible?0:-1;}
      });
    });
  }
  function goTo(index,focus=false) {
    const next=Math.max(0,Math.min(panels.length-1,index));
    const target=enabled ? start+story.chapters[next].start+story.chapters[next].duration*.08 : naturalTops[next]-top;
    window.scrollTo({top:Math.max(0,target),behavior:reduced.matches?'instant':'smooth'});
    if(focus) choices[next].focus({preventScroll:true});
  }
  choices.forEach((choice,i)=>{
    choice.addEventListener('click',()=>goTo(i));
    choice.addEventListener('keydown',event=>{
      let index;
      if(['ArrowRight','ArrowDown'].includes(event.key)) index=(i+1)%panels.length;
      if(['ArrowLeft','ArrowUp'].includes(event.key)) index=(i-1+panels.length)%panels.length;
      if(event.key==='Home') index=0;
      if(event.key==='End') index=panels.length-1;
      if(index===undefined) return;
      event.preventDefault();goTo(index,true);
    });
  });
  $('[data-project-prev]')?.addEventListener('click',()=>goTo((active-1+panels.length)%panels.length));
  $('[data-project-next]')?.addEventListener('click',()=>goTo((active+1)%panels.length));
  all('[data-case-go]').forEach(el=>el.addEventListener('click',event=>{
    event.preventDefault();goTo(choices.findIndex(c=>c.dataset.serviceTab===el.dataset.caseGo));
  }));
  const remeasure=()=>document.dispatchEvent(new CustomEvent('nexo:layout'));
  if('ResizeObserver' in window) {
    const observer=new ResizeObserver(remeasure);
    panels.forEach(panel=>observer.observe(panel));
  }
  window.nexoPortfolio={measure,paint,goTo};
})();
