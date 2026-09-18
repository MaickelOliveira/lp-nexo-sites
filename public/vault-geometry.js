import * as THREE from './vendor/three.module.min.js';

// World-space dimensions keep the hinge, plate, bolts and opening aligned.
export const VAULT = Object.freeze({outer:1.02,opening:.615,bodyDepth:.56,doorRadius:.658,doorDepth:.22,hingeX:-.73});

export function buildVault(textures={}) {
  const root=new THREE.Group();
  const steel=new THREE.MeshPhysicalMaterial({color:0x717b84,metalness:.86,roughness:.32,clearcoat:.18,envMapIntensity:1.25});
  const edge=new THREE.MeshStandardMaterial({color:0xb9c1c8,metalness:.92,roughness:.24,envMapIntensity:1.3});
  const dark=new THREE.MeshStandardMaterial({color:0x20272b,metalness:.7,roughness:.44});
  const lime=new THREE.MeshStandardMaterial({color:0xa9dc2d,emissive:0xb9f134,emissiveIntensity:1.35,metalness:.25,roughness:.3});
  const mesh=(geometry,material,parent=root)=>{
    const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const disc=(r,depth,material,parent)=>{
    const m=mesh(new THREE.CylinderGeometry(r,r,depth,72),material,parent);m.rotation.x=Math.PI/2;return m;
  };
  const torus=(r,tube,z,material,parent=root)=>{
    const m=mesh(new THREE.TorusGeometry(r,tube,12,96),material,parent);m.position.z=z;return m;
  };
  const faceMaterial=map=>new THREE.MeshStandardMaterial({map:map||null,color:map?0xd8dce0:0x79818a,metalness:.46,roughness:.44,alphaTest:.15});
  const profile=new THREE.Shape();profile.absarc(0,0,VAULT.outer,0,Math.PI*2,false);
  const hole=new THREE.Path();hole.absarc(0,0,VAULT.opening,0,Math.PI*2,true);profile.holes.push(hole);
  const body=mesh(new THREE.ExtrudeGeometry(profile,{depth:VAULT.bodyDepth,steps:1,bevelEnabled:true,bevelThickness:.026,bevelSize:.023,bevelSegments:3,curveSegments:80}),steel);
  body.position.z=-VAULT.bodyDepth;
  body.name='solid-vault-body';
  const frontGeometry=new THREE.RingGeometry(VAULT.opening,VAULT.outer,96);
  const positions=frontGeometry.attributes.position,uv=frontGeometry.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setXY(i,positions.getX(i)/2.13+.5,positions.getY(i)/2.13+.5);
  const front=mesh(frontGeometry,faceMaterial(textures.frame));front.position.z=.032;front.name='original-vault-front';
  torus(1.023,.028,-.01,edge);
  torus(1.018,.022,-.24,edge);
  torus(1.021,.03,-.54,edge);
  torus(.633,.022,-.014,edge);
  torus(.697,.008,.039,lime);

  // A real tunnel remains open when the plate swings away and the camera enters.
  const interior=new THREE.Group();root.add(interior);
  const tunnelMaterial=new THREE.MeshStandardMaterial({color:0x192019,metalness:.64,roughness:.44,side:THREE.BackSide});
  const tunnel=mesh(new THREE.CylinderGeometry(.616,.56,2.8,96,1,true),tunnelMaterial,interior);
  tunnel.rotation.x=Math.PI/2;tunnel.position.z=-1.4;tunnel.castShadow=false;
  for(let i=1;i<=7;i++) {
    const z=-i*.36,r=.614-i*.007;
    torus(r,.018,z,dark,interior);
    if(i%2===1) {
      for(let j=0;j<4;j++) {
        const led=mesh(new THREE.TorusGeometry(r-.01,.006,6,32,.23),lime,interior);
        led.rotation.z=j*Math.PI/2+.25;led.position.z=z;led.castShadow=false;
      }
    }
  }
  const tunnelEnd=mesh(new THREE.CircleGeometry(.58,64),new THREE.MeshBasicMaterial({color:0x060907}),interior);
  tunnelEnd.position.z=-2.85;tunnelEnd.castShadow=false;
  for(let i=0;i<12;i++) {
    const a=Math.PI/2+i*Math.PI/6;
    if(Math.abs(Math.cos(a)+1)<.01)continue;
    const bolt=mesh(new THREE.CylinderGeometry(.036,.044,.045,6),edge);
    bolt.rotation.x=Math.PI/2;bolt.position.set(Math.cos(a)*.93,Math.sin(a)*.93,.055);
  }
  for(const y of [-.39,.39]) {
    const mount=mesh(new THREE.BoxGeometry(.21,.2,.13),steel);mount.position.set(VAULT.hingeX,y,.064);
    const hinge=mesh(new THREE.CylinderGeometry(.062,.062,.36,40),edge);hinge.position.set(VAULT.hingeX,y,.12);
    for(const delta of [-.12,.12]) {
      const collar=mesh(new THREE.CylinderGeometry(.075,.075,.025,40),dark);collar.position.set(VAULT.hingeX,y+delta,.12);
    }
  }

  const pivot=new THREE.Group();pivot.position.set(VAULT.hingeX,0,.01);root.add(pivot);
  const door=new THREE.Group();door.position.x=-VAULT.hingeX;pivot.add(door);
  const plate=disc(VAULT.doorRadius,VAULT.doorDepth,steel,door);plate.position.z=.079;plate.name='solid-door-plate';
  torus(VAULT.doorRadius-.012,.021,.174,edge,door);
  torus(VAULT.doorRadius-.012,.017,-.025,edge,door);
  const plateFront=mesh(new THREE.PlaneGeometry(1.385,1.385),faceMaterial(textures.door),door);
  plateFront.position.z=.191;plateFront.name='original-door-finish';
  const back=disc(.59,.018,dark,door);back.position.z=-.046;
  torus(.47,.017,-.06,edge,door);
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    const rib=mesh(new THREE.BoxGeometry(.39,.042,.048),steel,door);rib.rotation.z=a;rib.position.set(Math.cos(a)*.3,Math.sin(a)*.3,-.064);
  }
  const bolts=[];
  for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4;
    const bolt=mesh(new THREE.BoxGeometry(.15,.049,.085),edge,door);bolt.rotation.z=angle;bolt.position.z=.108;
    bolts.push({mesh:bolt,angle});
  }
  const shaft=disc(.063,.16,edge,door);shaft.position.z=.275;
  const wheel=new THREE.Group();wheel.position.z=.365;door.add(wheel);
  torus(.221,.027,0,edge,wheel);
  const hub=disc(.068,.065,steel,wheel);hub.position.z=.006;
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3+Math.PI/2;
    const spoke=mesh(new THREE.CylinderGeometry(.018,.02,.171,18),edge,wheel);
    spoke.rotation.z=a-Math.PI/2;spoke.position.set(Math.cos(a)*.13,Math.sin(a)*.13,0);
  }
  const indicator=mesh(new THREE.BoxGeometry(.012,.035,.005),lime,wheel);indicator.position.set(0,.024,.042);

  function pose(frame) {
    // Keep the interior enclosed by the housing until the view enters the opening.
    interior.scale.z=.19+.81*THREE.MathUtils.clamp((frame.enter||0)*4,0,1);
    pivot.rotation.y=THREE.MathUtils.degToRad(frame.doorAngle);
    wheel.rotation.z=THREE.MathUtils.degToRad(-frame.wheelAngle);
    for(const bolt of bolts) {
      const radius=.68-frame.unlock*.1;
      bolt.mesh.position.x=Math.cos(bolt.angle)*radius;
      bolt.mesh.position.y=Math.sin(bolt.angle)*radius;
    }
  }
  pose({doorAngle:0,wheelAngle:0,unlock:0});
  return {root,pivot,door,plate,body,wheel,bolts,interior,pose};
}
