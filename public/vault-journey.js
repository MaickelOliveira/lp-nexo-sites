import * as THREE from './vendor/three.module.min.js';
import {buildHeist,heistFlight} from './vault-heist.js?v=16';

const clamp=v=>Math.max(0,Math.min(1,v));
const ease=v=>{const p=clamp(v);return p*p*(3-2*p);};
const phase=(p,a,b)=>ease((p-a)/(b-a));
const mix=THREE.MathUtils.lerp;

// One continuous camera path: the same scroll coordinate always retraces it.
export function journeyFrame(p,approachZ=8,mobile=false) {
  const stops=[[.365,approachZ],[.47,1.6],[.545,.12],[.61,-4.6],[.66,-6.8]];
  let z=approachZ;
  for(let i=1;i<stops.length;i++)if(p>=stops[i-1][0])z=mix(stops[i-1][1],stops[i][1],phase(p,stops[i-1][0],stops[i][0]));
  const inside=phase(p,.55,.65),reveal=phase(p,.68,.86),finale=phase(p,.87,1);
  const flight=p>=.66?heistFlight(p,mobile):{x:0,y:0,z,lookX:0,lookY:0,roll:0};
  return {...flight,inside,reveal,finale};
}

// The interior uses architectural surfaces and recessed safe-deposit drawers.
// The entrance stays circular; beyond it the camera enters a quiet, solid chamber.
export function buildJourney() {
  const root=new THREE.Group();root.name='vault-inner-world';
  const graphite=new THREE.MeshStandardMaterial({color:0x252b2a,metalness:.72,roughness:.36,envMapIntensity:.85});
  const steel=new THREE.MeshPhysicalMaterial({color:0x8c918b,metalness:.9,roughness:.29,clearcoat:.18,envMapIntensity:.85});
  const champagne=new THREE.MeshStandardMaterial({color:0x9b9176,metalness:.85,roughness:.3,envMapIntensity:.75});
  const dark=new THREE.MeshStandardMaterial({color:0x0e1413,metalness:.5,roughness:.5,side:THREE.DoubleSide});
  const light=new THREE.MeshBasicMaterial({color:0xe7ecd3,toneMapped:false});
  const lime=new THREE.MeshBasicMaterial({color:0xb8e63c,toneMapped:false});
  const mesh=(g,m,parent=root)=>{const o=new THREE.Mesh(g,m);parent.add(o);return o;};
  const box=(w,h,d,m,x=0,y=0,z=0,parent=root)=>{
    const o=mesh(new THREE.BoxGeometry(w,h,d),m,parent);o.position.set(x,y,z);return o;
  };
  // Beveled physical panels give highlights to edges without exposed wire shapes.
  const panelGeometry=(w,h,d,r=.04)=>{
    const s=new THREE.Shape(),x=-w/2,y=-h/2;
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
    s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
    s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
    const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,steps:1,curveSegments:4});
    g.translate(0,0,-d/2);return g;
  };
  const baffle=mesh(new THREE.RingGeometry(.614,40,96),new THREE.MeshBasicMaterial({color:0x0e0e0e,side:THREE.DoubleSide}));
  baffle.position.z=-.028;
  const throat=mesh(new THREE.CylinderGeometry(.615,1.72,2.6,64,1,true),dark);
  throat.rotation.x=Math.PI/2;throat.position.z=-1.3;
  // Only the original doorway has circular metal trim.
  const collar=mesh(new THREE.TorusGeometry(.625,.025,10,80),steel);collar.position.z=-.12;
  box(5.8,.16,26,graphite,0,-1.73,-15.5);
  box(5.8,.14,26,dark,0,2.2,-15.5);
  for(const side of [-1,1]) {
    box(.2,4,26,graphite,side*2.85,.2,-15.5);
    box(.03,.045,26,champagne,side*2.71,-1.61,-15.5);
    // Recessed ceiling coves, restrained warm light and a narrow reflected floor line.
    box(.065,.025,25,light,side*2.56,2.08,-15.5);
    box(.018,.012,25,light,side*2.59,-1.636,-15.5);
  }
  for(let i=0;i<9;i++) {
    box(5.5,.015,.018,dark,0,-1.642,-3-i*3);
    for(const side of [-1,1])box(.14,3.8,.11,champagne,side*2.73,.2,-3-i*3);
  }
  // Flush deposit boxes sit in both walls, with real inset borders and handles.
  const depositMetal=new THREE.MeshStandardMaterial({color:0x303b37,metalness:.76,roughness:.44,envMapIntensity:.4});
  const count=96,drawers=new THREE.InstancedMesh(panelGeometry(1.27,.58,.08),depositMetal,count);
  const handles=new THREE.InstancedMesh(new THREE.BoxGeometry(.3,.035,.048),champagne,count);
  const matrix=new THREE.Object3D();let index=0;
  for(const side of [-1,1])for(let col=0;col<12;col++)for(let row=0;row<4;row++) {
    const z=-7.7-col*1.45,y=-1.04+row*.73;
    matrix.position.set(side*2.713,y,z);matrix.rotation.set(0,-side*Math.PI/2,0);matrix.updateMatrix();drawers.setMatrixAt(index,matrix.matrix);
    matrix.position.set(side*2.643,y-.08,z);matrix.updateMatrix();handles.setMatrixAt(index,matrix.matrix);index++;
  }
  root.add(drawers,handles);
  const doors=[];
  for(const z of [-6.5]) {
    // Deep surrounds hide the sliding leaves in side pockets.
    box(.24,4,.6,champagne,-2.5,.2,z);box(.24,4,.6,champagne,2.5,.2,z);
    box(5.2,.2,.6,champagne,0,2.12,z);
    box(.035,3.8,.035,light,-2.36,.2,z+.32);box(.035,3.8,.035,light,2.36,.2,z+.32);
    for(const side of [-1,1]) {
      const door=new THREE.Group();door.position.set(side*1.15,.18,z);root.add(door);
      mesh(panelGeometry(2.28,3.68,.22,.055),graphite,door);
      const face=mesh(panelGeometry(2.12,3.5,.035,.035),steel,door);face.position.z=.135;
      box(.045,2.4,.065,champagne,-side*.86,0,.19,door);
      box(.012,.6,.009,lime,-side*1.095,.5,.175,door);
      for(const y of [-1.15,1.15])box(1.92,.016,.012,champagne,0,y,.161,door);
      doors.push({door,side,start:.545,end:.65});
    }
  }
  const heist=buildHeist();root.add(heist.root);
  // A final recessed opening leads onward; the center stays quiet behind the copy.
  box(6,4.3,.2,dark,0,.2,-28.2);
  box(.28,4.1,.5,steel,-2.18,.2,-25);box(.28,4.1,.5,steel,2.18,.2,-25);
  box(4.65,.23,.5,steel,0,2.15,-25);
  box(.045,3.86,.025,light,-2.01,.2,-24.74);box(.045,3.86,.025,light,2.01,.2,-24.74);
  box(4.02,.045,.025,light,0,2.07,-24.74);
  // The final recess is permanently open, avoiding another repeated door motion.
  const lamps=[];
  for(const z of [-5,-12,-21]) {
    const lamp=new THREE.PointLight(0xf0eedb,5,12,2);lamp.position.set(0,1.6,z);root.add(lamp);lamps.push(lamp);
    box(1.4,.015,.8,light,0,2.1,z);
  }
  // Fade the room away while keeping the gold as a live 3D foreground object.
  const backdropMeshes=[],backdropMaterials=new Map();
  root.traverse(o=>{
    if(!o.isMesh&&!o.isPoints)return;
    let parent=o;while(parent){if(parent===heist.treasure)return;parent=parent.parent;}
    backdropMeshes.push(o);
    for(const material of (Array.isArray(o.material)?o.material:[o.material]))if(!backdropMaterials.has(material))backdropMaterials.set(material,{opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});
  });
  function pose(p,f=journeyFrame(p),mobile=false) {
    root.visible=p>=.405;
    for(const {door,side,start,end} of doors)door.position.x=side*(1.15+phase(p,start,end)*2.32);
    heist.pose(p,mobile);
    const dim=phase(p,.65,.75);
    lamps[0].intensity=mix(5,1.7,dim);
    lamps[1].intensity=mix(5,.75,dim);
    lamps[2].intensity=1+f.finale*3;
    const paper=phase(p,.905,.955);
    for(const o of backdropMeshes)o.visible=paper<.999;
    for(const [m,original] of backdropMaterials) {
      const transparent=paper>0||original.transparent;
      if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}
      m.opacity=original.opacity*(1-paper);m.depthWrite=paper>0?false:original.depthWrite;
    }
  }
  pose(0);return {root,doors,heist,pose};
}
