import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile('public/motion.js','utf8');
const app=await readFile('public/app.js','utf8');
const heroSource=await readFile('public/hero.js','utf8');
const portfolioSource=await readFile('public/portfolio.js','utf8');

function fixture() {
  let allowLayout=true,reads=0,writes=0,queries=0,serial=0;
  const frames=new Map(),listeners=new Map(),media=new Map(),nodes=new Map(),groups=new Map();
  const on=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
  const emit=type=>(listeners.get(type)||[]).forEach(fn=>fn({type}));
  const element=(name,top=0,height=100)=>{
    const classes=new Set(),values=new Map();
    const el={name,childNodes:[],dataset:{},textContent:'',inert:false,offsetParent:null,
      classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);},contains:k=>classes.has(k),remove:k=>classes.delete(k)},
      style:{setProperty(k,v){writes++;values.set(k,String(v));},getPropertyValue:k=>values.get(k)||'',removeProperty(k){values.delete(k);}},
      attributes:new Map(),addEventListener:on,closest:()=>null,
      setAttribute(k,v){this.attributes.set(k,v);},getAttribute(k){return this.attributes.get(k);},removeAttribute(k){this.attributes.delete(k);},
      querySelector:s=>find(s),querySelectorAll:s=>findAll(s),
      geometry:{offsetTop:top,offsetHeight:height,clientHeight:height,scrollHeight:height}
    };
    for(const key of Object.keys(el.geometry))Object.defineProperty(el,key,{get(){
      assert(allowLayout,`Unexpected layout read during scroll: ${name}.${key}`);reads++;return el.geometry[key];
    }});
    nodes.set(name,el);return el;
  };
  const find=s=>{queries++;return nodes.get(s)||null;};
  const findAll=s=>{queries++;return groups.get(s)||[];};
  const root=element('html',0,25000);
  const document={documentElement:root,body:element('body'),hidden:false,
    querySelector:find,querySelectorAll:findAll,addEventListener:on,dispatchEvent:e=>emit(e.type)};
  const matchMedia=query=>{
    if(!media.has(query))media.set(query,{matches:false,addEventListener:(type,fn)=>on(query,fn)});
    return media.get(query);
  };
  const window={document,innerHeight:900,innerWidth:1440,scrollY:0,addEventListener:on,matchMedia};
  const context={window,document,matchMedia,requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id;},
    IntersectionObserver:class{observe(){} disconnect(){}},
    getComputedStyle(el){assert(allowLayout,'Unexpected style read during scroll');reads++;return {position:el.name==='.intent-sticky'?'sticky':'relative',paddingTop:'0',marginTop:'0',marginBottom:'40'};},
    CustomEvent:class{constructor(type){this.type=type;}},module:{exports:{}}};
  const flush=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());};
  const run=code=>vm.runInNewContext(code,context);
  return {element,nodes,groups,window,document,root,media,matchMedia,emit,flush,run,frames,
    lock(){allowLayout=false;reads=0;writes=0;queries=0;},unlock(){allowLayout=true;},
    stats:()=>({reads,writes,queries}),scroll(y){window.scrollY=y;emit('scroll');flush();}};
}

function page() {
  const h=fixture(),e=h.element;
  const sections=[['.nexo-hero',0,5800],['.work',6700,6500],['.intent',13300,2070],['.method',15400,2400],['.difference',17800,1800],['.faq',19600,1700],['.contact',21300,2200]].map(a=>e(...a));
  h.groups.set('main > section',sections);
  h.groups.set('.scene-transition',sections.slice(1,6));
  e('.site-header');e('.reading-progress');e('.work-ribbon');e('.intent-sticky',0,900);e('.intent-track',13500);
  e('.intent-highlight');e('.method-list',15600,1900);e('[data-method-number]');e('.method-counter');
  e('.difference-statement',17900,500);e('.principle-grid',18500,600);e('.faq-symbol');
  e('.contact-main');e('.contact-circle');e('.contact-bottom');e('.site-footer',23500,1500);e('.footer-top');
  h.groups.set('.intent-line',[e('line1',0,110),e('line2',110,130),e('line3',240,150)]);
  h.groups.set('.method-step',[0,1,2,3].map(i=>e('step'+i,15600+i*440,400)));
  h.groups.set('.principle',[e('principle1'),e('principle2'),e('principle3')]);
  h.groups.set('.faq-list details',[e('question',19900,110)]);
  let heroPaints=0;
  h.window.nexoHero={enabled:true,stageHeight:900,configure(){},paint(){heroPaints++;}};
  h.run(app);h.run(source);h.flush();
  return {...h,heroPaints:()=>heroPaints};
}

test('scroll bursts share one frame with no DOM queries or layout reads',()=>{
  const h=page();h.lock();const before=h.heroPaints();
  for(let i=1;i<=30;i++){h.window.scrollY=i*10;h.emit('scroll');}
  assert.equal(h.frames.size,1);h.flush();
  assert.equal(h.heroPaints(),before+1);
  assert.equal(h.stats().reads,0);assert.equal(h.stats().queries,0);
  assert.equal(h.nodes.get('.reading-progress').style.getPropertyValue('transform'),'scaleX('+300/24100+')');
  assert(h.nodes.get('.site-header').classList.contains('is-scrolled'));
  h.scroll(0);assert.equal(h.nodes.get('.reading-progress').style.getPropertyValue('transform'),'scaleX(0)');
});

test('offscreen sections stop writing; intent band retraces using transforms, without layout height changes',()=>{
  const h=page();h.lock();h.scroll(300);
  assert.equal(h.stats().writes,1,'Only reading progress should change while distant sections are idle');
  const band=h.nodes.get('.intent-highlight');
  h.scroll(13300);const first=band.style.getPropertyValue('transform');
  h.scroll(13885);const middle=band.style.getPropertyValue('transform');
  h.scroll(14470);const last=band.style.getPropertyValue('transform');
  assert.notEqual(first,middle);assert.notEqual(middle,last);
  assert.equal(band.style.getPropertyValue('height'),'110px');
  assert.equal(last,'translate3d(0,240px,0) scaleY('+150/110+')');
  h.scroll(13885);assert.equal(band.style.getPropertyValue('transform'),middle);
  h.scroll(13300);assert.equal(band.style.getPropertyValue('transform'),first);
});

test('anchor jumps and returning upward settle section states, including after layout changes',()=>{
  const h=page(),circle=h.nodes.get('.contact-circle');h.lock();
  const initial=circle.style.getPropertyValue('transform');
  h.scroll(23500);assert.equal(circle.style.getPropertyValue('transform'),'rotate(0deg)');
  assert.equal(h.nodes.get('[data-method-number]').textContent,'04');
  h.scroll(0);assert.equal(circle.style.getPropertyValue('transform'),initial);
  assert.equal(h.nodes.get('[data-method-number]').textContent,'01');
  h.unlock();h.root.geometry.scrollHeight=26000;h.emit('nexo:layout');h.flush();h.lock();
  h.scroll(25100);assert.equal(h.nodes.get('.reading-progress').style.getPropertyValue('transform'),'scaleX(1)');
  assert.equal(h.stats().reads,0);
});

test('reduced-motion preference refreshes cached endpoints without hiding content',()=>{
  const h=page();h.matchMedia('(prefers-reduced-motion: reduce)').matches=true;
  h.emit('(prefers-reduced-motion: reduce)');h.flush();h.lock();
  assert.equal(h.nodes.get('.contact-circle').style.getPropertyValue('transform'),'rotate(0deg)');
  assert.equal(h.nodes.get('question').style.getPropertyValue('opacity'),'1');
  h.scroll(5000);assert.equal(h.nodes.get('question').style.getPropertyValue('opacity'),'1');
});

test('hero paints only its visible text and affected layers; reverse scroll restores chapters',()=>{
  const h=fixture(),e=h.element;
  const hero=e('.nexo-hero');hero.classList.toggle('nx-webgl',true);
  ['.nx-stage','.nx-vault','.nx-vault-perspective','.nx-vault-door','.nx-vault-wheel','.nx-vault-glow','.nx-color-wipe','.nx-paper-wipe','.nx-orbit-one','.nx-orbit-two','.nx-desire-first','.nx-desire-last','.nx-progress i','.nx-cinema-shade','.nx-treasure-paper','[data-hero-count]'].forEach(s=>e(s,0,900));
  e('.nx-opening',0,500);e('.nx-opening-bottom',400,100);e('.nx-bottom',800);e('.nx-invitation',0,500);
  const scenes=[0,1,2,3].map(i=>e('scene'+i));h.groups.set('[data-hero-scene]',scenes);
  h.groups.set('.nx-chapters span',[0,1,2,3].map(i=>e('chapter'+i)));
  h.run(heroSource);const controller=h.window.nexoHero;controller.configure(900);controller.paint(.68,false);
  const textState=scenes[2].style.getPropertyValue('opacity');h.lock();controller.paint(.7,false);
  assert.equal(h.stats().writes,1,'Inside the laser chapter only the progress bar changes in the DOM');
  assert.equal(hero.style.getPropertyValue('--nx-progress'),'');
  assert.equal(scenes[2].inert,false);assert.equal(scenes[0].inert,true);
  controller.paint(1,false);assert.equal(scenes[3].inert,false);assert.equal(scenes[2].inert,true);
  controller.paint(.68,false);assert.equal(scenes[2].inert,false);assert.equal(scenes[3].inert,true);
  assert.equal(scenes[2].style.getPropertyValue('opacity'),textState);
  controller.paint(0,false);assert.equal(scenes[0].inert,false);
  assert.equal(h.nodes.get('[data-hero-count]').textContent,'01');
});

test('all four projects remain reachable and keyboard access follows the active cover in both directions',()=>{
  const h=fixture(),e=h.element;
  e('.portfolio-journey',10000,6000);e('.work-panels',0,600);e('.site-header',0,94);
  ['[data-project-current]','[data-project-count]','[data-project-external]','[data-project-status]'].forEach(s=>e(s));
  const names=['Telas Jort','Ciola','GameHub','Zelo'];
  const panels=names.map((name,i)=>{
    const panel=e('panel'+i,0,900),link=e('link'+i,60,40);link.href='https://example.com/'+i;
    panel.querySelector=()=>link;panel.querySelectorAll=()=>[link];return panel;
  });
  const choices=names.map((name,i)=>{const el=e('choice'+i);el.dataset.projectName=name;return el;});
  h.groups.set('[data-service-panel]',panels);h.groups.set('[data-service-tab]',choices);
  h.window.scrollTo=({top})=>{h.window.scrollY=top;};
  h.run(portfolioSource);const controller=h.window.nexoPortfolio;controller.measure(900);h.lock();
  for(const i of [0,1,2,3,2,1,0]){
    controller.goTo(i);controller.paint(h.window.scrollY);
    assert.equal(h.nodes.get('[data-project-current]').textContent,names[i]);
    assert.equal(panels.filter(p=>!p.inert).length,1);assert.equal(panels[i].inert,false);
    assert.equal(panels[i].querySelector().tabIndex,0);
    panels.forEach((p,j)=>assert.equal(p.style.getPropertyValue('visibility'),j===i?'visible':'hidden'));
    assert.equal(panels.filter(p=>p.style.getPropertyValue('will-change')!=='auto').length,1);
  }
  assert.equal(h.stats().reads,0);
  h.lock();controller.paint(h.window.scrollY);assert.equal(h.stats().writes,0);
});
