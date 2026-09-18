import * as THREE from './vendor/three.module.min.js';
import {buildVault} from './vault-geometry.js';
import {buildJourney,journeyFrame} from './vault-journey.js?v=16';

const hero=document.querySelector('.nexo-hero');
const stage=hero?.querySelector('.nx-stage');
const fallback=hero?.querySelector('.nx-vault');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
let renderer,environment,model,journey,lastFrame,lastMobile=false,width=0,height=0,baseWidth=0;
let ready=false,disposed=false;
let renderedKey='';
const pointer={x:0,y:0};
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(32,1,.018,100);camera.position.set(0,0,8.5);
const look=new THREE.Vector3();
const studioLights=[];

function measure() {
  if(!renderer||disposed)return;
  const w=stage.clientWidth,h=stage.clientHeight;
  if(w!==width||h!==height) {
    width=w;height=h;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  baseWidth=fallback.offsetWidth;
  hero.classList.toggle('nx-compact-ending',width/height<1.55||width<=700);
}
function paint(frame,mobile) {
  lastFrame=frame;lastMobile=mobile;
  if(!ready||disposed)return;
  measure();
  const key=[frame.p,mobile,width,height,baseWidth,pointer.x,pointer.y].join('|');
  if(key===renderedKey)return;
  // Keep rendering through the final hero chapter, after the exterior is behind us.
  renderer.domElement.style.visibility='visible';renderer.domElement.style.opacity=1;
  const viewHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*8.5;
  const viewWidth=viewHeight*camera.aspect;
  const parallax=reduced.matches?0:1-frame.enter;
  const inward=THREE.MathUtils.smoothstep(frame.p,.365,.545);
  const scale=baseWidth/height*viewHeight/2.15*(frame.p<.365?frame.scale:(mobile?1.48:.86));
  model.root.position.set((frame.left/100-.5)*viewWidth,(.5-frame.top/100)*viewHeight*(1-inward),0);
  model.root.scale.setScalar(scale);
  model.root.rotation.set(THREE.MathUtils.degToRad(frame.rx)+pointer.y*.045*parallax,THREE.MathUtils.degToRad(frame.ry)+pointer.x*.065*parallax,0);
  model.pose(frame);
  const compactEnding=width/height<1.55||mobile;
  const flight=journeyFrame(frame.p,8.5/scale,compactEnding);
  journey.pose(frame.p,flight,compactEnding);
  studioLights.forEach(({light,base})=>{light.intensity=base*(1-flight.inside*.78);if(base===3.2)light.castShadow=frame.enter<.12;});
  model.interior.visible=frame.p<.405;
  for(const child of model.root.children) if(child!==journey.root&&child!==model.interior) child.visible=flight.z>-.65;
  camera.position.set(flight.x*scale,flight.y*scale,flight.z*scale);
  look.set(flight.lookX*scale,flight.lookY*scale,camera.position.z-4*scale);
  camera.lookAt(look);camera.rotateZ(flight.roll);
  renderer.shadowMap.enabled=frame.enter<.12||frame.p>.84;
  try {
    renderer.render(scene,camera);
    renderedKey=key;
    if(!hero.classList.contains('nx-webgl')) {hero.classList.add('nx-webgl');requestPaint();}
  } catch {
    ready=false;hero.classList.remove('nx-webgl');renderer.domElement.style.visibility='hidden';requestPaint();
  }
}
function requestPaint() {document.dispatchEvent(new Event('nexo:motion'));}
function pointerMove(event) {
  if(!ready||reduced.matches||!finePointer.matches||lastFrame?.enter>.7)return;
  pointer.x=(event.clientX/window.innerWidth-.5)*2;
  pointer.y=(event.clientY/window.innerHeight-.5)*2;
  requestPaint();
}
function pointerLeave() {pointer.x=pointer.y=0;requestPaint();}
function contextLost(event) {
  event.preventDefault();ready=false;renderedKey='';hero.classList.remove('nx-webgl');
  if(renderer)renderer.domElement.style.visibility='hidden';
  requestPaint();
}
function restore() {
  if(disposed)return;
  try {ready=true;renderedKey='';measure();if(lastFrame)paint(lastFrame,lastMobile);}
  catch {ready=false;hero.classList.remove('nx-webgl');}
}
async function start() {
  if(!stage||!fallback)return;
  try {
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.className='nx-vault-canvas';renderer.domElement.setAttribute('aria-hidden','true');
    stage.append(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost',contextLost);
    renderer.domElement.addEventListener('webglcontextrestored',restore);
    measure();
    const loader=new THREE.TextureLoader();
    const textures=await Promise.all(['frame','door'].map(name=>loader.loadAsync(new URL(`./assets/vault/vault-${name}.webp`,import.meta.url).href)));
    textures.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});
    // Softboxes provide reflections on the actual beveled metal surfaces.
    const room=new THREE.Scene();room.background=new THREE.Color(0x343a40);
    for(const [x,y,z,w,h,intensity] of [[-5,3,3,3,9,5],[4,3,1,2,8,3],[0,6,-1,9,4,4]]) {
      const box=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(intensity,intensity,intensity),side:THREE.DoubleSide}));
      box.position.set(x,y,z);box.lookAt(0,0,0);room.add(box);
    }
    const pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromScene(room,.1);
    scene.environment=environment.texture;pmrem.dispose();
    room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
    scene.add(new THREE.HemisphereLight(0xdbe9fa,0x151d11,1.8));
    const key=new THREE.DirectionalLight(0xf3f7ff,3.2);key.position.set(-3,5,7);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-7,right:7,top:6,bottom:-6,near:.1,far:22});key.shadow.bias=-.0003;
    scene.add(key);
    const rim=new THREE.DirectionalLight(0xc1f731,1.7);rim.position.set(5,1,-3);scene.add(rim);
    const fill=new THREE.DirectionalLight(0xc6d6ec,.8);fill.position.set(3,-2,4);scene.add(fill);
    studioLights.push({light:key,base:3.2},{light:rim,base:1.7},{light:fill,base:.8});
    model=buildVault({frame:textures[0],door:textures[1]});scene.add(model.root);
    journey=buildJourney();model.root.add(journey.root);
    ready=true;
    window.nexoVault3D={paint};
    stage.addEventListener('pointermove',pointerMove,{passive:true});
    stage.addEventListener('pointerleave',pointerLeave,{passive:true});
    window.addEventListener('resize',requestPaint,{passive:true});
    // The next existing scroll-driver frame positions the object before revealing it.
    requestPaint();
  } catch {
    ready=false;hero?.classList.remove('nx-webgl');renderer?.domElement.remove();renderer?.dispose();
  }
}
start();
