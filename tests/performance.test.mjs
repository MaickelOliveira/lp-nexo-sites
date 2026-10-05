import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.min.js';
import {batchStaticMeshes,qualityFor} from '../public/vault-performance.js';
import {buildVault} from '../public/vault-geometry.js';
import {buildJourney,journeyFrame} from '../public/vault-journey.js';
import {selectEncoding,isNotModified} from '../server/static-assets.mjs';

function bounds(root){root.updateMatrixWorld(true);return new THREE.Box3().setFromObject(root);}
function assertBox(a,b){assert(a.min.distanceTo(b.min)<1e-5);assert(a.max.distanceTo(b.max)<1e-5);}

test('batching preserves transformed geometry, shadows and independently moving parts',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  for(let i=0;i<5;i++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1+i,.6,.3),material);
    mesh.position.set(i-2,i*.2,-i);mesh.rotation.set(.1*i,.2*i,0);mesh.castShadow=true;root.add(mesh);
  }
  const moving=root.children[0];moving.userData.dynamic=true;
  const before=bounds(root);batchStaticMeshes(root);
  assert.equal(root.children.length,2);assert(root.children.includes(moving));
  assertBox(before,bounds(root));
  assert(root.children.every(mesh=>mesh.castShadow));
  moving.position.x=30;assert(bounds(root).max.x>29);
});

test('vault mechanics and continuous camera path remain reversible',()=>{
  const vault=buildVault(),journey=buildJourney();
  const opened={enter:.8,doorAngle:-108,wheelAngle:-138,unlock:1};
  vault.pose(opened);const pose=bounds(vault.root),door=vault.pivot.rotation.y;
  vault.pose({enter:0,doorAngle:0,wheelAngle:0,unlock:0});vault.pose(opened);
  assertBox(pose,bounds(vault.root));assert.equal(vault.pivot.rotation.y,door);
  const forward=[];
  for(let i=0;i<=100;i++)forward.push(journeyFrame(i/100,8,true));
  for(let i=100;i>=0;i--){
    assert.deepEqual(journeyFrame(i/100,8,true),forward[i]);journey.pose(i/100,forward[i],true);
    journey.root.traverse(o=>assert([...o.position,...o.scale].every(Number.isFinite)));
  }
  journey.pose(.75);let calls=0;journey.root.traverseVisible(o=>{if(o.isMesh)calls++;});
  assert(calls<35,`Interior mesh budget exceeded: ${calls}`);
  journey.pose(1);assert.equal(journey.heist.treasure.visible,true);
});

test('mobile quality limits render pixels without reducing text resolution',()=>{
  assert.deepEqual(qualityFor({pixelRatio:3,coarse:true}),{pixelRatio:1.25,shadows:false});
  assert.deepEqual(qualityFor({pixelRatio:2}),{pixelRatio:1.5,shadows:true});
  assert.equal(qualityFor({pixelRatio:1}).pixelRatio,1);
});

test('compression negotiation honours accepted formats and disabled encodings',()=>{
  const asset={br:100,gzip:120};
  assert.equal(selectEncoding('gzip, br',asset),'br');
  assert.equal(selectEncoding('br;q=0, gzip;q=.5',asset),'gzip');
  assert.equal(selectEncoding('gzip;q=0, br;q=0',asset),null);
  assert.equal(selectEncoding('',asset),null);
  assert.equal(selectEncoding('br',{gzip:10}),null);
  assert.equal(isNotModified('W/"old", "new"','W/"new"'),true);
  assert.equal(isNotModified('"old"','W/"new"'),false);
});
