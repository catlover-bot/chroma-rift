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
  surface.position.set(2.65, 1.7, 11.4);
  surface.rotation.y = -Math.PI / 3;
  const scene = new THREE.Scene();
  scene.add(surface);
  const camera = new THREE.PerspectiveCamera(65, 390 / 740, .08, 60);
  camera.position.set(-2.45, 1.6, 11.3);
  camera.rotation.set(0, Math.PI / 2, 0, 'YXZ');
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
