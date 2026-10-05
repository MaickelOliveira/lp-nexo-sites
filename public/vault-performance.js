import * as THREE from './vendor/three.module.min.js';

// Batch only static siblings. Animated hinges, groups and locking bolts retain
// their own transforms. Additive laser layers are order independent.
export function batchStaticMeshes(parent) {
  for (const child of [...parent.children]) if (!child.isMesh) batchStaticMeshes(child);
  const buckets = new Map();
  for (const child of parent.children) {
    if (!child.isMesh || child.isInstancedMesh || child.children.length || child.userData.dynamic ||
        Array.isArray(child.material) || child.geometry.morphAttributes.position ||
        (child.material.transparent && child.material.blending !== THREE.AdditiveBlending)) continue;
    const attrs = Object.keys(child.geometry.attributes).sort().join(',');
    const key = [child.material.uuid, child.castShadow, child.receiveShadow, child.renderOrder, attrs].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(child);
  }
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const geometry = new THREE.BufferGeometry();
    for (const name of Object.keys(geometries[0].attributes)) {
      const attributes = geometries.map(g => g.getAttribute(name));
      const values = new attributes[0].array.constructor(attributes.reduce((n,a) => n+a.array.length,0));
      let offset = 0;
      for (const attribute of attributes) { values.set(attribute.array, offset); offset += attribute.array.length; }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attributes[0].itemSize, attributes[0].normalized));
    }
    const indices = []; let offset = 0;
    for (const g of geometries) {
      const count = g.getAttribute('position').count;
      if (g.index) for (const index of g.index.array) indices.push(index+offset);
      else for (let i=0;i<count;i++) indices.push(i+offset);
      offset += count; g.dispose();
    }
    geometry.setIndex(indices); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    const first = meshes[0], batch = new THREE.Mesh(geometry, first.material);
    batch.name = 'static-batch'; batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow; batch.renderOrder = first.renderOrder;
    parent.add(batch);
    for (const mesh of meshes) parent.remove(mesh);
  }
  return parent;
}

export function qualityFor({pixelRatio=1,coarse=false,memory=8,cores=8}={}) {
  const modest = coarse || memory <= 4 || cores <= 4;
  return {pixelRatio:Math.min(pixelRatio,modest?1.25:1.5),shadows:!modest};
}
