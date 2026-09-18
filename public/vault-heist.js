import * as THREE from './vendor/three.module.min.js';

const clamp=v=>Math.max(0,Math.min(1,v));
const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
const phase=(p,a,b)=>ease((p-a)/(b-a));
const route=new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,0,-6.8),new THREE.Vector3(-.82,-.5,-10.3),
  new THREE.Vector3(.83,.4,-14),new THREE.Vector3(-.7,-.32,-17.4),
  new THREE.Vector3(.5,.28,-20.4),new THREE.Vector3(-.45,.45,-21.8)
],false,'centripetal');

export function heistFlight(p,mobile=false) {
  const u=phase(p,.66,1),pos=route.getPoint(u),tangent=route.getTangent(u);
  const settle=phase(p,.91,1);
  if(mobile)pos.x+=.45*settle;
  const tilt=phase(p,.66,.69)*(1-phase(p,.91,.98));
  return {x:pos.x,y:pos.y,z:pos.z,
    lookX:pos.x+tangent.x*.5*tilt,
    lookY:pos.y+tangent.y*.35*tilt-.33*settle,
    roll:-tangent.x*.035*tilt};
}

function crossing(z) {
  let low=0,high=1;
  for(let i=0;i<36;i++){const t=(low+high)/2;if(route.getPoint(t).z>z)low=t;else high=t;}
  return route.getPoint((low+high)/2);
}
// Each plane has an actual gap around the camera's route, not a simulated collision.
export const LASERS=[-9.3,-12.7,-16.2,-19.1].flatMap((z,i)=>{
  const pass=crossing(z),segments=[];
  for(const side of [-1,1]) {
    const slope=(i%2?-.28:.28)*side,b=pass.y+side*.66-slope*pass.x;
    const candidates=[];
    for(const x of [-2.68,2.68]){const y=slope*x+b;if(y>=-1.57&&y<=2.04)candidates.push(new THREE.Vector3(x,y,z));}
    for(const y of [-1.57,2.04]){const x=(y-b)/slope;if(x>=-2.68&&x<=2.68)candidates.push(new THREE.Vector3(x,y,z));}
    segments.push({a:candidates[0],b:candidates[1]});
  }
  const x=pass.x+(pass.x<0?1:-1)*.9;
  segments.push({a:new THREE.Vector3(x,-1.57,z),b:new THREE.Vector3(x,2.04,z)});
  return segments;
});

export function buildHeist() {
  const root=new THREE.Group();root.name='laser-route-and-gold';
  const coreMat=new THREE.MeshBasicMaterial({color:0xffd8d7,toneMapped:false});
  const beamMat=new THREE.MeshBasicMaterial({color:0xff263e,transparent:true,opacity:.48,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
  const hazeMat=beamMat.clone();hazeMat.opacity=.085;
  const emitterMat=new THREE.MeshStandardMaterial({color:0x171d1c,metalness:.78,roughness:.32});
  const lensMat=new THREE.MeshBasicMaterial({color:0xff2942,toneMapped:false});
  const field=new THREE.Group();root.add(field);
  const axis=new THREE.Vector3(0,1,0);
  const mesh=(g,m,parent=root)=>{const o=new THREE.Mesh(g,m);parent.add(o);return o;};
  const laserGeometry=new THREE.CylinderGeometry(1,1,1,8);
  const emitterGeometry=new THREE.SphereGeometry(.058,10,8);
  const lensGeometry=new THREE.SphereGeometry(.026,8,6);
  for(const {a,b} of LASERS) {
    const delta=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5),length=delta.length();
    const direction=delta.clone().normalize();
    for(const [radius,material] of [[.005,coreMat],[.019,beamMat],[.06,hazeMat]]) {
      const o=mesh(laserGeometry,material,field);o.position.copy(mid);o.scale.set(radius,length,radius);o.quaternion.setFromUnitVectors(axis,direction);
    }
    for(const p of [a,b]) {
      mesh(emitterGeometry,emitterMat,field).position.copy(p);
      mesh(lensGeometry,lensMat,field).position.copy(p).addScaledVector(direction,p===a?.048:-.048);
    }
  }
  const spill=new THREE.PointLight(0xff2540,2.2,7,2);spill.position.set(1,0,-13);field.add(spill);
  const spill2=new THREE.PointLight(0xff3144,1.8,7,2);spill2.position.set(-1,0,-18);field.add(spill2);

  const treasure=new THREE.Group();treasure.name='gold-reveal';treasure.position.set(.38,0,-26.75);root.add(treasure);
  const baseMat=new THREE.MeshPhysicalMaterial({color:0x111817,metalness:.7,roughness:.3,clearcoat:.6});
  const baseDark=new THREE.Color(0x111817),baseLight=new THREE.Color(0xe6e6de);
  // Tiny variations in polish keep the ingots metallic instead of perfectly plastic.
  const finishData=new Uint8Array(128*128*4);
  let seed=7919;
  for(let i=0;i<128*128;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const value=185+(seed>>>26);
    finishData.set([value,value,value,255],i*4);
  }
  const finish=new THREE.DataTexture(finishData,128,128,THREE.RGBAFormat);
  finish.wrapS=finish.wrapT=THREE.RepeatWrapping;finish.repeat.set(5,12);
  finish.generateMipmaps=true;finish.minFilter=THREE.LinearMipmapLinearFilter;finish.magFilter=THREE.LinearFilter;finish.needsUpdate=true;
  const gold=new THREE.MeshPhysicalMaterial({color:0xffd477,metalness:1,roughness:.2,roughnessMap:finish,bumpMap:finish,bumpScale:.00065,clearcoat:.06,clearcoatRoughness:.14,envMapIntensity:2.35});
  const finishes=[gold,gold.clone(),gold.clone()];finishes[1].roughness=.185;finishes[2].roughness=.215;
  const ingotShape=new THREE.Shape();ingotShape.moveTo(-.32,0);ingotShape.lineTo(.32,0);ingotShape.lineTo(.265,.22);ingotShape.lineTo(-.265,.22);ingotShape.closePath();
  const ingotGeometry=new THREE.ExtrudeGeometry(ingotShape,{depth:1.08,steps:1,bevelEnabled:true,bevelThickness:.027,bevelSize:.026,bevelSegments:5,curveSegments:1});ingotGeometry.translate(0,0,-.54);
  const pedestal=mesh(new THREE.BoxGeometry(2.5,1,2.25),baseMat,treasure);pedestal.position.y=-1.12;
  pedestal.receiveShadow=true;
  const rim=mesh(new THREE.BoxGeometry(2.52,.018,2.27),new THREE.MeshStandardMaterial({color:0x947338,metalness:.88,roughness:.25}),treasure);rim.position.y=-.613;
  const ingots=[];
  for(let row=0;row<3;row++)for(let i=0;i<3-row;i++)for(let depth=0;depth<2;depth++) {
    const o=mesh(ingotGeometry,finishes[(row+i+depth)%3],treasure);o.position.set((i-(2-row)/2)*.71,-.56+row*.278,(depth-.5)*1.12);
    o.castShadow=true;o.receiveShadow=true;
    o.rotation.y=(row===2?.06:0);ingots.push(o);
  }
  const warm=new THREE.PointLight(0xfff1d2,0,10,2);warm.position.set(-.8,1.3,-23.7);root.add(warm);
  const top=new THREE.PointLight(0xffffff,0,8,2);top.position.set(1.4,1.5,-26);root.add(top);
  const key=new THREE.SpotLight(0xfff3dc,0,12,.66,.7,2);key.position.set(-.6,2.5,-24.1);
  key.target.position.set(.38,-.3,-26.75);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.near=.2;key.shadow.camera.far=12;
  key.shadow.bias=-.0001;key.shadow.normalBias=.012;key.shadow.radius=2;
  root.add(key,key.target);
  function pose(p,mobile=false) {
    const discovery=phase(p,.84,.94);
    const paper=phase(p,.905,.955);
    baseMat.color.lerpColors(baseDark,baseLight,paper);
    baseMat.metalness=THREE.MathUtils.lerp(.7,.12,paper);
    baseMat.roughness=THREE.MathUtils.lerp(.3,.46,paper);
    warm.intensity=discovery*11;top.intensity=discovery*9;key.intensity=discovery*48;
    key.visible=discovery>0;
    key.target.position.x=mobile?0:.38;
    treasure.position.x=mobile?0:.38;
    treasure.position.y=mobile?-.25:0;
    treasure.scale.set(mobile?.4:.82,1,mobile?.88:1);
    field.visible=p>.5;
  }
  pose(0);return {root,field,treasure,ingots,pose};
}
