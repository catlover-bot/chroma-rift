import * as THREE from 'three';

import { getWorld } from '../../../domain/firstPerson/chapter';
import { createInitialRuntime } from '../../../domain/firstPerson/runtime';
import { createFirstPersonDiagnostics, installShaderDiagnostics, recordDiagnosticError, sampleGlDiagnostics, sampleRendererDiagnostics, serializeDiagnostics, snapshotDiagnostics } from '../diagnostics';
import { PROOF_CAMERA, PROOF_OBJECTS } from '../ProofScene';

function proofFixture() {
  const scene = new THREE.Scene();
  for (const object of PROOF_OBJECTS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: object.color, fog: false, toneMapped: false }));
    mesh.name = object.name; mesh.position.set(...object.position); mesh.scale.set(...object.scale); scene.add(mesh);
  }
  const camera = new THREE.PerspectiveCamera(PROOF_CAMERA.fov, 390 / 740, PROOF_CAMERA.near, PROOF_CAMERA.far);
  camera.position.set(...PROOF_CAMERA.position); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
  const renderer = {
    info: { render: { calls: 3, triangles: 36 }, memory: { geometries: 3, textures: 0 } },
    getPixelRatio: () => 3, getRenderTarget: () => null,
    getViewport: (target: THREE.Vector4) => target.set(0, 0, 390, 740),
    getScissor: (target: THREE.Vector4) => target.set(0, 0, 390, 740), getScissorTest: () => false,
  } as unknown as THREE.WebGLRenderer;
  return { scene, camera, renderer };
}
describe('bounded local diagnostic record (CPU/contract evidence only)', () => {
  it('separates simulation, actual render and presentation counters from pixel evidence', () => {
    const record = createFirstPersonDiagnostics('proof');
    const next = createFirstPersonDiagnostics('proof');
    expect(next.session).toBe(record.session + 1);
    record.simulationTicks = 40;
    expect(record.renderCalls).toBe(0); expect(record.renderReturns).toBe(0); expect(record.presentationReturns).toBe(0);
    expect(record.sceneSampleRenderReturn).toBe(0);
    record.renderCalls = 7; record.renderReturns = 7; record.presentationReturns = 7;
    const { scene, camera, renderer } = proofFixture();
    sampleRendererDiagnostics(record, renderer, scene, camera);
    expect(record.sceneSampleRenderReturn).toBe(7);
    record.renderReturns = 8;
    expect(JSON.parse(serializeDiagnostics(record))).toMatchObject({ renderReturns: 8, sceneSampleRenderReturn: 7 });
    expect(record.lastFrame.drawCalls).toBe(3);
    expect(record.scene.frustumCandidateMeshes).toBe(3);
    expect(record.pixelEvidence).toBe('not-sampled');
    expect(record.stage).toBe('initializing');
    const snapshot = snapshotDiagnostics(record);
    snapshot.simulationTicks = 0; snapshot.glErrors.push('test');
    expect(record.simulationTicks).toBe(40); expect(record.glErrors).toEqual([]);
  });
  it('counts ancestry visibility and camera layers, and flags invalid projection instead of reporting ready', () => {
    const { scene, camera, renderer } = proofFixture();
    scene.children[0]!.layers.set(2);
    scene.children[1]!.visible = false;
    const record = createFirstPersonDiagnostics('proof');
    sampleRendererDiagnostics(record, renderer, scene, camera);
    expect(record.scene.meshes).toBe(3); expect(record.scene.visibleLayerMeshes).toBe(1);
    camera.aspect = 0; camera.updateProjectionMatrix();
    sampleRendererDiagnostics(record, renderer, scene, camera);
    expect(typeof record.camera === 'object' && record.camera.valid).toBe(false);
    expect(record.scene.frustumCandidateMeshes).toBe(0);
    expect(record.stage).toBe('initializing');
  });
  it('reports supported pose from the actual initial world and leaves unavailable APIs explicit', () => {
    const runtime = createInitialRuntime();
    const { scene, camera } = proofFixture();
    const record = createFirstPersonDiagnostics();
    sampleRendererDiagnostics(record, {} as THREE.WebGLRenderer, scene, camera, getWorld(runtime), runtime.pose);
    expect(record.pose).toEqual({ insideSolid: false, supportedFloor: true, safe: true });
    expect(record.viewport).toBe('unsupported'); expect(record.renderTarget).toBe('unsupported');
    expect(record.lastFrame.drawCalls).toBe('unsupported'); expect(record.glVersion).toBe('unknown');
  });
  it('bounds actual shader/GL diagnostics and preserves the prior shader hook and compile checking', () => {
    const previous = jest.fn();
    const renderer = { debug: { checkShaderErrors: false, onShaderError: previous } } as unknown as THREE.WebGLRenderer;
    const record = createFirstPersonDiagnostics();
    const fail = jest.fn();
    const cleanup = installShaderDiagnostics(renderer, record, fail);
    expect(renderer.debug.checkShaderErrors).toBe(true);
    const gl = {
      LINK_STATUS: 1, NO_ERROR: 0, VERSION: 2, SHADING_LANGUAGE_VERSION: 3,
      getProgramInfoLog: () => 'program link failed', getShaderInfoLog: (shader: unknown) => shader === 'vertex' ? 'vertex compile failed' : 'fragment compile failed',
      getParameter: () => 'supported API version', getError: jest.fn(() => 0x0502),
    } as unknown as WebGLRenderingContext;
    type ShaderProgram = Parameters<NonNullable<THREE.WebGLRenderer['debug']['onShaderError']>>[1];
    for (let index = 0; index < 6; index += 1) renderer.debug.onShaderError!(gl, 'program' as unknown as ShaderProgram, 'vertex' as unknown as WebGLShader, 'fragment' as unknown as WebGLShader);
    expect(record.shaderErrors).toHaveLength(4); expect(previous).toHaveBeenCalledTimes(6); expect(fail).toHaveBeenCalledTimes(6);
    expect(record.lastError?.phase).toBe('shader'); expect(record.shaderErrors[0]?.fragment).toBe('fragment compile failed');
    sampleGlDiagnostics(record, gl);
    expect(gl.getError).toHaveBeenCalledTimes(4);
    expect(record.glErrors).toEqual(['0x502', '0x502', '0x502', '0x502']);
    cleanup(); expect(renderer.debug.onShaderError).toBe(previous); expect(renderer.debug.checkShaderErrors).toBe(false);
  });
  it('reads Expo native WebGL2 support and framebuffer status without inventing them from Three', () => {
    const record = createFirstPersonDiagnostics();
    const gl = { supportsWebGL2: false, FRAMEBUFFER: 0x8d40, FRAMEBUFFER_COMPLETE: 0x8cd5, checkFramebufferStatus: jest.fn(() => 0x8cd5) } as unknown as WebGLRenderingContext;
    sampleGlDiagnostics(record, gl);
    expect(record.supportsWebGL2).toBe(false); expect(record.framebufferStatus).toBe(0x8cd5);
    expect(gl.checkFramebufferStatus).toHaveBeenCalledWith(0x8d40);
    sampleGlDiagnostics(record, {} as WebGLRenderingContext);
    expect(record.supportsWebGL2).toBe('unsupported'); expect(record.framebufferStatus).toBe('unsupported');
  });
  it('exports only a bounded local record and redacts URLs, email and user-directory paths in errors', () => {
    const record = createFirstPersonDiagnostics();
    const error = new Error(`failed https://example.com/private user@example.com /home/private/workspace ${'x'.repeat(10000)}`);
    recordDiagnosticError(record, error, 'shader');
    const text = serializeDiagnostics(record);
    expect(text).not.toContain('user@example.com'); expect(text).not.toContain('https://example.com'); expect(text).not.toContain('/home/private');
    expect(text).toContain('[email]'); expect(text).toContain('[url]'); expect(text.length).toBeLessThan(7000);
    expect(record.lastError?.message.length).toBeLessThanOrEqual(1600); expect(record.lastError?.stack.length).toBeLessThanOrEqual(2400);
  });
  it('places a large unlit proof box predictably within the fixed portrait frustum', () => {
    const { scene, camera } = proofFixture();
    const box = scene.getObjectByName('proof-box') as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(box);
    const center = bounds.getCenter(new THREE.Vector3()).project(camera);
    const left = new THREE.Vector3(bounds.min.x, 1, bounds.max.z).project(camera);
    const right = new THREE.Vector3(bounds.max.x, 1, bounds.max.z).project(camera);
    expect(center.x).toBeCloseTo(0); expect(Math.abs(center.y)).toBeLessThan(0.3);
    expect(center.z).toBeGreaterThan(-1); expect(center.z).toBeLessThan(1);
    expect(right.x - left.x).toBeGreaterThan(0.8); expect(right.x - left.x).toBeLessThan(1.5);
    expect(box.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((box.material as THREE.MeshBasicMaterial).map).toBeNull(); expect((box.material as THREE.MeshBasicMaterial).fog).toBe(false);
  });
});
