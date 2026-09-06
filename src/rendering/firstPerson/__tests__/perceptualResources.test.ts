import * as THREE from 'three';
import source from '../../../../assets/perceptual/hollow-mask.json';
import hybrid from '../../../../assets/perceptual/hybrid-texture.json';
import { createPerceptualResources, HYBRID_ASSET_ID } from '../perceptualResources';

describe('offline perceptual resources', () => {
  test('front-facing real nose is behind the rim and convex control faces the same viewing side', () => {
    const r = createPerceptualResources();
    const position = r.maskGeometry.getAttribute('position');
    expect(position.count).toBe(1293);
    expect(r.maskGeometry.index!.count / 3).toBe(2518);
    expect(r.maskMaterial.side).toBe(THREE.FrontSide);
    expect(r.maskGeometry.boundingBox!.min.z).toBeCloseTo(-.5550166, 6);
    const nose = 241;
    expect(position.getX(nose)).toBe(0);
    expect(position.getZ(nose)).toBeCloseTo(r.maskGeometry.boundingBox!.min.z, 6);
    expect(r.maskGeometry.getAttribute('normal').getZ(nose)).toBeGreaterThan(.98);
    expect(r.convexControlGeometry.getAttribute('position').getZ(nose)).toBeCloseTo(.5550166, 6);
    expect(r.convexControlGeometry.getAttribute('normal').getZ(nose)).toBeGreaterThan(.98);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, position.getY(nose), 2), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(new THREE.Mesh(r.maskGeometry, r.maskMaterial)).length).toBeGreaterThan(0);
    expect(ray.intersectObject(new THREE.Mesh(r.convexControlGeometry, r.maskMaterial)).length).toBeGreaterThan(0);
    r.dispose();
  });
  test('camera movement and material color preserve physical arrays and one mipmapped opaque sRGB texture', () => {
    const r = createPerceptualResources(), mesh = new THREE.Mesh(r.maskGeometry, r.maskMaterial);
    mesh.updateMatrixWorld(); const matrix = mesh.matrixWorld.toArray();
    const positions = Array.from(r.maskGeometry.getAttribute('position').array), normals = Array.from(r.maskGeometry.getAttribute('normal').array);
    const identity = r.hybridTexture, bytes = r.hybridTexture.image.data!.slice();
    const camera = new THREE.PerspectiveCamera(65,390/844,.05,30);
    for (const distance of [2.3,3.6,5.2]) { camera.position.set(distance/5,0,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();r.maskMaterial.color.set('#BDB8A9'); }
    expect(mesh.matrixWorld.toArray()).toEqual(matrix);
    expect(Array.from(r.maskGeometry.getAttribute('position').array)).toEqual(positions);
    expect(Array.from(r.maskGeometry.getAttribute('normal').array)).toEqual(normals);
    expect(r.hybridTexture).toBe(identity);expect(r.hybridTexture.image.data!.join(',')).toBe(bytes.join(','));
    expect(r.hybridTexture.name).toBe(HYBRID_ASSET_ID);
    expect(r.hybridTexture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(r.hybridTexture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(r.hybridTexture.generateMipmaps).toBe(true);
    expect(r.textureBytes).toBe(512*512*4);
    expect(r.textureBytesWithMipmaps).toBe(1398100);
    const gray=Uint8Array.from(atob(hybrid.pixelsBase64), ch => ch.charCodeAt(0));
    for(const [x,y] of [[0,0],[255,255],[301,411],[511,511]]) {const target=((511-y!)*512+x!)*4;expect(Array.from(bytes.slice(target,target+4))).toEqual([gray[y!*512+x!],gray[y!*512+x!],gray[y!*512+x!],255]);}
    expect(source.positions.length).toBe(positions.length);r.dispose();
  });
  test('each owner disposes all two geometries, two materials and one texture once', () => {
    const r=createPerceptualResources();const resources=[r.maskGeometry,r.convexControlGeometry,r.maskMaterial,r.hybridTexture,r.hybridMaterial];
    const spies=resources.map(o=>jest.spyOn(o,'dispose'));r.dispose();r.dispose();spies.forEach(spy=>expect(spy).toHaveBeenCalledTimes(1));
  });
});
