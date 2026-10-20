import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parseByteRange } from '../server/static-assets.mjs';
const source = await readFile('public/hero-video.js', 'utf8');
const context = { module: { exports: {} } };
vm.runInNewContext(source, context);
const { frameTime } = context.module.exports;

test('scroll returns to exactly the same video frame and never seeks beyond the last frame', () => {
  const forwards = Array.from({length:101}, (_, i) => frameTime(i / 100, 16));
  for (let i = 100; i >= 0; i--) assert.equal(frameTime(i / 100, 16), forwards[i]);
  assert.equal(frameTime(-1,16),0);
  assert.equal(frameTime(2,16),383/24);
  assert.equal(frameTime(.5,NaN),0);
});

test('video byte ranges support browser probes, end seeks, and invalid ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-1', 1000), {start:0,end:1});
  assert.deepEqual(parseByteRange('bytes=700-', 1000), {start:700,end:999});
  assert.deepEqual(parseByteRange('bytes=-40', 1000), {start:960,end:999});
  assert.deepEqual(parseByteRange('bytes=700-2000', 1000), {start:700,end:999});
  for (const value of ['bytes=1000-', 'bytes=20-10', 'bytes=-0', 'bytes=-']) assert.equal(parseByteRange(value,1000),false);
  assert.equal(parseByteRange(undefined, 1000),null);
});

function makePlayer(portrait = false, fetchFails = false) {
  const media = {portrait}, requests = [];
  const handlers = new Map(), frames = new Map(), seeks = [];
  let clock = 0, serial = 0;
  let time = 0, fetches = 0, loads = 0, plays = 0;
  const windowHandlers = new Map();
  const video = {
    dataset: {desktop:'/desktop.mp4',mobile:'/mobile.mp4'}, style:{},
    readyState:0, duration:16, seeking:false,
    addEventListener(name, fn) { handlers.set(name,fn); },
    load() { loads++; }, play:async()=>{plays++;}, pause() {},
    get currentTime() { return time; },
    set currentTime(value) { time=value;this.seeking=true;seeks.push(value); }
  };
  const hero = {querySelector:()=>video,classList:{add(){}}};
  const window = {nexoHero:{enabled:true},addEventListener(name,fn){windowHandlers.set(name,fn);}};
  const document = {hidden:false,querySelector:()=>hero,addEventListener(){},dispatchEvent(){}};
  vm.runInNewContext(source, {
    window, document, navigator:{}, Blob,
    URL:{createObjectURL:()=> 'blob:local-film',revokeObjectURL(){}},
    fetch:async(url)=> {requests.push(url);fetches++;if(fetchFails)throw new Error('Fetch unavailable');return {ok:true,blob:async()=>new Blob(['film'])};},
    matchMedia:query=>({matches:query.includes('orientation: portrait') && media.portrait,addEventListener(){}}),
    requestAnimationFrame:fn=> {const id=++serial;frames.set(id,fn);return id;},
    cancelAnimationFrame:id=>frames.delete(id)
  });
  const flush=()=> {clock+=1000/60;const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(clock);};
  return {media,requests,video,handlers,windowHandlers,seeks,frames,flush,player:window.nexoHeroVideo,
    get time(){return time;}, get fetches(){return fetches;}, get loads(){return loads;}, get plays(){return plays;}};
}

test('film loads once, seeks after metadata and coalesces rapid reverse scroll', async () => {
  const h=makePlayer();
  const {player,windowHandlers,video,handlers,flush,seeks}=h;
  player.paint(.5,false);player.paint(.6,false);
  windowHandlers.get('wheel')();assert.equal(h.plays,0,'never start an empty media source while the file is loading');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.fetches,1);assert.equal(h.loads,1);assert.equal(video.src,'blob:local-film');
  video.readyState=1;handlers.get('loadedmetadata')();flush();
  assert.equal(seeks.length,1);assert.equal(h.time,frameTime(.6,16));
  player.paint(.8,false);player.paint(.1,false);flush();
  assert.equal(seeks.length,1,'an in-flight seek must not be replaced until decoded');
  video.seeking=false;handlers.get('seeked')();flush();flush();
  assert.equal(h.time,frameTime(.1,16));
  player.setActive(false);player.paint(.9,false);video.seeking=false;handlers.get('seeked')();flush();
  assert.equal(seeks.length,2,'offscreen video remains idle');
  player.setActive(true);flush();assert.equal(h.time,frameTime(.9,16));
  assert.equal(h.fetches,1);
});


test('wheel steps settle smoothly, reverse without a seek backlog, and stop requesting idle frames', async () => {
  const h=makePlayer();
  const {player,video,handlers,flush,seeks,frames}=h;
  player.paint(0,false);
  await new Promise(resolve=>setImmediate(resolve));
  video.readyState=1;handlers.get('loadedmetadata')();flush();
  const step=()=>{video.seeking=false;handlers.get('seeked')();flush();flush();};
  player.paint(.04,false);flush();
  assert.ok(h.time>0 && h.time<frameTime(.04,16),'wheel movement has a short catch-up instead of a full jump');
  for(let i=0;i<7;i++)step();
  const beforeReverse=h.time;
  player.paint(.015,false);step();
  assert.ok(h.time<beforeReverse,'reversing the scroll changes direction on the next decoded frame');
  for(let i=0;i<30;i++)step();
  assert.equal(h.time,frameTime(.015,16));
  flush();
  assert.equal(frames.size,0,'no continuous animation loop while the video is stationary');
  player.paint(.04,false);flush();
  const busyCount=seeks.length;
  for(let i=0;i<5;i++){player.paint(.04+i*.002,false);flush();}
  assert.equal(seeks.length,busyCount,'intermediate targets cannot interrupt an active decode');
  player.setActive(false);flush();
  assert.equal(frames.size,0,'leaving the hero cancels its frame loop');
  player.paint(1,false);player.setActive(true);step();
  assert.equal(h.time,383/24,'reentering at the end shows the final frame without replaying missed scroll');
  assert.equal(h.fetches,1);
});


test('portrait uses the full-height crop and switches to the wide master after rotation', async () => {
  const h=makePlayer(true);
  h.player.paint(.4,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.requests,['/mobile.mp4']);
  h.player.paint(.5,true);
  assert.equal(h.fetches,1);
  h.media.portrait=false;
  h.player.paint(.5,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.requests,['/mobile.mp4','/desktop.mp4']);
  assert.equal(h.loads,2);
  h.player.paint(.6,false);
  assert.equal(h.fetches,2);
});

test('a decoded frame gets a rendering opportunity before the newest scroll target is sought', async () => {
  const h=makePlayer();
  h.player.paint(.2,false);
  await new Promise(resolve=>setImmediate(resolve));
  h.video.readyState=4;h.handlers.get('loadeddata')();h.flush();
  assert.equal(h.seeks.length,1);
  assert.equal(h.frames.size,0,'decoding must not run a polling animation loop');
  h.player.paint(.8,false);h.player.paint(.1,false);
  assert.equal(h.frames.size,0,'rapid scroll keeps only its destination while decoding');
  h.video.seeking=false;h.handlers.get('seeked')();
  h.player.paint(.9,false);
  h.flush();
  assert.equal(h.seeks.length,1,'the decoded frame must remain available during the next paint');
  h.player.paint(.05,false);h.flush();
  assert.equal(h.seeks.length,2);
  assert.equal(h.time,frameTime(.05,16),'the destination may change up to the next rendering opportunity');
  h.video.seeking=false;h.handlers.get('seeked')();
  h.player.setActive(false);h.flush();
  assert.equal(h.frames.size,0,'offscreen frames cancel the pending presentation');
});

test('switching direct media sources during a seek releases the previous decoder', async () => {
  const h=makePlayer(true,true);
  h.player.paint(.25,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.video.src,'/mobile.mp4');
  h.video.readyState=4;h.handlers.get('loadedmetadata')();h.flush();
  assert.equal(h.seeks.length,1);
  h.media.portrait=false;h.player.paint(.75,false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.video.src,'/desktop.mp4');
  h.video.seeking=false;h.handlers.get('loadedmetadata')();h.flush();
  assert.equal(h.time,frameTime(.75,16),'a cancelled seek from the previous source must not block the replacement');
});
