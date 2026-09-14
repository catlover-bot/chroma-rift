import * as THREE from 'three';

import { createPlanarMirror } from '../planarMirror';

function rendererStub() {
  let target: THREE.WebGLRenderTarget | null = null;
  const viewport = new THREE.Vector4(3, 4, 390, 740), scissor = new THREE.Vector4(5, 6, 380, 730);
  let scissorTest = true;
  const renderer = {
    xr: { enabled: true }, shadowMap: { autoUpdate: true }, autoClear: true,
    state: { buffers: { depth: { setMask: jest.fn() } } }, clear: jest.fn(),
    getRenderTarget: () => target,
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => { target = next; },
    getViewport: (out: THREE.Vector4) => out.copy(viewport),
    setViewport: (value: THREE.Vector4 | number, y?: number, width?: number, height?: number) => typeof value === 'number'
      ? viewport.set(value, y!, width!, height!) : viewport.copy(value),
    getScissor: (out: THREE.Vector4) => out.copy(scissor),
    setScissor: (value: THREE.Vector4 | number, y?: number, width?: number, height?: number) => typeof value === 'number'
      ? scissor.set(value, y!, width!, height!) : scissor.copy(value),
    getScissorTest: () => scissorTest,
    setScissorTest: (value: boolean) => { scissorTest = value; },
  };
  return { renderer: renderer as unknown as THREE.WebGLRenderer, current: () => ({ target, viewport: viewport.clone(), scissor: scissor.clone(), scissorTest }) };
}

test.each([false, true])('planar reflection restores target, viewport, scissor and mirror on draw failure=%s', fails => {
  const mirror = createPlanarMirror(256);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mirror.material);
  surface.position.set(-2.65, 1.9, 11.4);
  surface.rotation.y = 1.32;
  const scene = new THREE.Scene();
  scene.add(surface);
  const camera = new THREE.PerspectiveCamera(65, 390 / 740, .08, 60);
  camera.position.set(-1.433, 1.6, 10.866);
  camera.rotation.set(-.16, 1.9744, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  const stub = rendererStub();
  const before = stub.current();
  const draw = jest.fn((renderer: THREE.WebGLRenderer, actualScene: THREE.Scene, reflected: THREE.PerspectiveCamera) => {
    expect(renderer).toBe(stub.renderer);
    expect(actualScene).toBe(scene);
    expect(reflected).toBe(mirror.camera);
    expect(reflected.position.x).not.toBeCloseTo(camera.position.x);
    expect(surface.visible).toBe(false);
    expect(stub.current()).toMatchObject({ target: mirror.target, scissorTest: false });
    if (fails) throw new Error('offscreen draw failed');
  });
  try {
    if (fails) expect(() => mirror.render(stub.renderer, scene, camera, surface, draw)).toThrow('offscreen draw failed');
    else expect(mirror.render(stub.renderer, scene, camera, surface, draw)).toBe(true);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(stub.current()).toEqual(before);
    expect(surface.visible).toBe(true);
    expect(stub.renderer.xr.enabled).toBe(true);
    expect(stub.renderer.shadowMap.autoUpdate).toBe(true);
  } finally {
    const release = jest.fn();
    mirror.target.addEventListener('dispose', release);
    mirror.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    surface.geometry.dispose();
  }
});

test('a mirror seen from the practice-lever side does not reuse a stale actor reflection', () => {
  const mirror = createPlanarMirror(256);
  const surface = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(new THREE.PlaneGeometry(1, 1), mirror.material);
  surface.position.set(-2.65, 1.9, 11.4); surface.rotation.y = 1.32;
  const scene = new THREE.Scene(); scene.add(surface);
  const camera = new THREE.PerspectiveCamera(65, 390 / 740, .08, 60);
  const stub = rendererStub(), draw = jest.fn();
  try {
    camera.position.set(-1.433, 1.6, 10.866); camera.updateMatrixWorld(true);
    expect(mirror.render(stub.renderer, scene, camera, surface, draw)).toBe(true);
    expect(draw).toHaveBeenCalledTimes(1);
    surface.material = mirror.material;
    camera.position.set(-2.45, 1.6, 7.5); camera.updateMatrixWorld(true);
    const reflected = mirror.render(stub.renderer, scene, camera, surface, draw);
    surface.material = reflected ? mirror.material : mirror.fallbackMaterial;
    expect(reflected).toBe(false);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(surface.material).toBe(mirror.fallbackMaterial);
    expect(surface.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(stub.current().target).toBeNull();
  } finally { mirror.dispose(); surface.geometry.dispose(); }
});

test('near, side and behind-plane camera positions keep reflection matrices and renderer state finite', () => {
  const mirror = createPlanarMirror(256);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mirror.material);
  surface.position.set(-2.65, 1.9, 11.4); surface.rotation.y = 1.32;
  const scene = new THREE.Scene(); scene.add(surface);
  const camera = new THREE.PerspectiveCamera(65, 390 / 740, .08, 60);
  const stub = rendererStub(), before = stub.current();
  try {
    for (const x of [-3.0, -2.7, -2.65, -2.63, -2.45, -1.8]) for (const z of [7.5, 10, 11.3, 13]) {
      camera.position.set(x, 1.6, z); camera.rotation.set(0, 1.1, 0, 'YXZ'); camera.updateMatrixWorld(true);
      const reflected = mirror.render(stub.renderer, scene, camera, surface, () => undefined);
      if (reflected) expect([...mirror.camera.projectionMatrix.elements, ...mirror.camera.matrixWorld.elements].every(Number.isFinite)).toBe(true);
      expect(stub.current()).toEqual(before);
    }
  } finally { mirror.dispose(); surface.geometry.dispose(); }
});
