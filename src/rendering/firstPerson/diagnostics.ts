import * as THREE from 'three';

import { inspectPoseSafety, isSafePose } from '../../domain/firstPerson/geometry';
import type { PlayerPose, WorldGeometry } from '../../domain/firstPerson/types';

export const DIAGNOSTIC_REVISION = 'goal-007-horror-r1';
export type DiagnosticSceneMode = 'chapter' | 'lab' | 'proof' | 'raw-gl';
export type DiagnosticStage = 'initializing' | 'context-created' | 'renderer-created' | 'scene-committed' | 'first-submitted' | 'ready' | 'failed' | 'closed';
export type Measurement<T> = T | 'unknown' | 'unsupported';
export type DimensionsRecord = { width: number; height: number };
export type DiagnosticError = { phase: string; name: string; message: string; stack: string; componentStack: string };
export type ShaderDiagnostic = { program: string; vertex: string; fragment: string };
export type FirstPersonDiagnostics = {
  revision: string; session: number; sceneMode: DiagnosticSceneMode; stage: DiagnosticStage; open: boolean;
  nativeGL: Measurement<boolean>; appActive: Measurement<boolean>; paused: boolean;
  rnLayout: Measurement<DimensionsRecord>; drawingBuffer: Measurement<DimensionsRecord>; pixelRatio: Measurement<number>;
  contextCreates: number; rendererCreates: number; rendererOwnership: 'unknown' | 'live' | 'teardown-only' | 'closed';
  sceneCommitted: boolean; frameCallbacks: number; simulationTicks: number; renderCalls: number; renderReturns: number; presentationReturns: number; sceneSampleRenderReturn: number;
  camera: Measurement<{ position: [number, number, number]; yaw: number; pitch: number; aspect: number; near: number; far: number; matricesFinite: boolean; valid: boolean; layers: number }>;
  pose: { insideSolid: Measurement<boolean>; supportedFloor: Measurement<boolean>; safe: Measurement<boolean> };
  scene: { children: number; meshes: number; visibleLayerMeshes: number; frustumCandidateMeshes: number; materials: number; geometries: number; textures: number };
  lastFrame: { drawCalls: Measurement<number>; triangles: Measurement<number>; geometries: Measurement<number>; textures: Measurement<number>; samplePoint: 'after-render-before-native-presentation' | 'after-render-and-native-wrapper-return' | 'not-sampled' };
  renderTarget: Measurement<'default-framebuffer' | 'offscreen-target'>;
  viewport: Measurement<[number, number, number, number]>; scissor: Measurement<[number, number, number, number]>; scissorTest: Measurement<boolean>;
  glVersion: Measurement<string>; shaderLanguage: Measurement<string>; supportsWebGL2: Measurement<boolean>; framebufferStatus: Measurement<number>; glErrors: string[]; shaderErrors: ShaderDiagnostic[];
  lastError: DiagnosticError | null;
  effectiveControls: { mode: 'unknown' | 'standard' | 'simple'; reason: string };
  pixelEvidence: 'not-sampled' | 'proof-triangle-center-differs-from-clear' | 'proof-center-did-not-match-triangle' | 'unsupported';
};
export type DiagnosticSnapshot = FirstPersonDiagnostics;
let nextSession = 0;

export function createFirstPersonDiagnostics(sceneMode: DiagnosticSceneMode = 'chapter'): FirstPersonDiagnostics {
  return {
    revision: DIAGNOSTIC_REVISION, session: ++nextSession, sceneMode, stage: 'initializing', open: false,
    nativeGL: 'unknown', appActive: 'unknown', paused: false, rnLayout: 'unknown', drawingBuffer: 'unknown', pixelRatio: 'unknown',
    contextCreates: 0, rendererCreates: 0, rendererOwnership: 'unknown', sceneCommitted: false,
    frameCallbacks: 0, simulationTicks: 0, renderCalls: 0, renderReturns: 0, presentationReturns: 0, sceneSampleRenderReturn: 0, camera: 'unknown',
    pose: { insideSolid: 'unknown', supportedFloor: 'unknown', safe: 'unknown' },
    scene: { children: 0, meshes: 0, visibleLayerMeshes: 0, frustumCandidateMeshes: 0, materials: 0, geometries: 0, textures: 0 },
    lastFrame: { drawCalls: 'unknown', triangles: 'unknown', geometries: 'unknown', textures: 'unknown', samplePoint: 'not-sampled' },
    renderTarget: 'unknown', viewport: 'unknown', scissor: 'unknown', scissorTest: 'unknown',
    glVersion: 'unknown', shaderLanguage: 'unknown', supportsWebGL2: 'unknown', framebufferStatus: 'unknown', glErrors: [], shaderErrors: [], lastError: null,
    effectiveControls: { mode: 'unknown', reason: 'not-evaluated' }, pixelEvidence: 'not-sampled',
  };
}

/** Diagnostics contain authored scene coordinates, counters and bounded logs.
 * Do not copy process/env/native identifiers into this document. */
export function boundedDiagnosticText(value: unknown, maxLength = 1600): string {
  return String(value ?? '')
    .replace(/https?:\/\/[^\s)]+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/[A-Z]:[\\/]Users[\\/][^\\/\s]+/gi, '[user]')
    .replace(/\/home\/[^/\s]+/g, '[user]')
    .slice(0, maxLength);
}
export function recordDiagnosticError(record: FirstPersonDiagnostics, error: unknown, phase: string, componentStack?: string | null): void {
  record.lastError = {
    phase: boundedDiagnosticText(phase, 80), name: error instanceof Error ? boundedDiagnosticText(error.name, 80) : 'Error',
    message: boundedDiagnosticText(error instanceof Error ? error.message : error),
    stack: error instanceof Error ? boundedDiagnosticText(error.stack, 2400) : '',
    componentStack: boundedDiagnosticText(componentStack, 1600),
  };
}
export function snapshotDiagnostics(record: FirstPersonDiagnostics): FirstPersonDiagnostics {
  // No renderer references or callbacks enter the record; copies cannot mutate
  // the live counters. Consumers refresh at most twice per second while open.
  return JSON.parse(JSON.stringify(record)) as FirstPersonDiagnostics;
}
export function serializeDiagnostics(record: FirstPersonDiagnostics): string {
  return JSON.stringify(snapshotDiagnostics(record), null, 2);
}
export function updateDiagnosticContext(record: FirstPersonDiagnostics, value: Pick<FirstPersonDiagnostics, 'effectiveControls' | 'appActive' | 'paused' | 'sceneMode'>): void {
  Object.assign(record, value);
}
export function setDiagnosticsOpen(record: FirstPersonDiagnostics, open: boolean): void { record.open = open; }
export function updateDiagnosticEnvironment(record: FirstPersonDiagnostics, value: Partial<Pick<FirstPersonDiagnostics, 'sceneMode' | 'appActive' | 'paused' | 'nativeGL'>>): void { Object.assign(record, value); }
export function recordCanvasLayout(record: FirstPersonDiagnostics, width: number, height: number): void {
  record.rnLayout = { width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 };
}
export function recordContextDiagnostics(record: FirstPersonDiagnostics, context: Pick<WebGLRenderingContext, 'drawingBufferWidth' | 'drawingBufferHeight'>): void {
  record.contextCreates += 1;
  record.drawingBuffer = { width: context.drawingBufferWidth, height: context.drawingBufferHeight };
}

function measure<T>(read: (() => T) | undefined): Measurement<T> {
  if (!read) return 'unsupported';
  try { return read(); } catch { return 'unsupported'; }
}
function measureVector(read: ((target: THREE.Vector4) => THREE.Vector4) | undefined): Measurement<[number, number, number, number]> {
  return measure(read ? () => {
    const value = read(new THREE.Vector4());
    return [value.x, value.y, value.z, value.w];
  } : undefined);
}
/** Sample after the real render/native wrapper returns, at startup or ≤2 Hz.
 * Mesh/frustum counts are geometric candidates, never proof of visible pixels. */
export function sampleRendererDiagnostics(record: FirstPersonDiagnostics, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, world?: WorldGeometry, pose?: PlayerPose): void {
  const matrixValues = [...camera.matrixWorld.elements, ...camera.matrixWorldInverse.elements, ...camera.projectionMatrix.elements];
  const matricesFinite = matrixValues.every(Number.isFinite);
  const valid = matricesFinite && [camera.position.x, camera.position.y, camera.position.z, camera.aspect, camera.near, camera.far].every(Number.isFinite)
    && camera.aspect > 0 && camera.near > 0 && camera.far > camera.near;
  record.camera = {
    position: [camera.position.x, camera.position.y, camera.position.z], yaw: camera.rotation.y, pitch: camera.rotation.x,
    aspect: camera.aspect, near: camera.near, far: camera.far, matricesFinite, valid, layers: camera.layers.mask,
  };
  if (world && pose) {
    const safety = inspectPoseSafety(pose, world);
    record.pose = { insideSolid: safety.intersectingSolidIds.length > 0, supportedFloor: safety.supportedFloor, safe: isSafePose(pose, world) };
  }
  const count = { children: scene.children.length, meshes: 0, visibleLayerMeshes: 0, frustumCandidateMeshes: 0, materials: 0, geometries: 0, textures: 0 };
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    count.meshes += 1;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      // Existing authored materials use map only; inspect the finite set of
      // public texture slots without walking arbitrary renderer internals.
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap'] as const) {
        const texture = (material as THREE.MeshStandardMaterial)[slot];
        if (texture instanceof THREE.Texture) textures.add(texture);
      }
    }
    let visible = meshMaterials.some((material) => material.visible);
    for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) visible = visible && ancestor.visible;
    if (visible && camera.layers.test(object.layers)) {
      count.visibleLayerMeshes += 1;
      if (valid && (!object.frustumCulled || frustum.intersectsObject(object))) count.frustumCandidateMeshes += 1;
    }
  });
  record.scene = { ...count, geometries: geometries.size, materials: materials.size, textures: textures.size };
  const info = renderer.info;
  record.lastFrame = {
    drawCalls: info?.render?.calls ?? 'unsupported', triangles: info?.render?.triangles ?? 'unsupported',
    geometries: info?.memory?.geometries ?? 'unsupported', textures: info?.memory?.textures ?? 'unsupported',
    samplePoint: 'after-render-and-native-wrapper-return',
  };
  record.pixelRatio = measure(typeof renderer.getPixelRatio === 'function' ? () => renderer.getPixelRatio() : undefined);
  record.renderTarget = measure(typeof renderer.getRenderTarget === 'function' ? () => renderer.getRenderTarget() === null ? 'default-framebuffer' : 'offscreen-target' : undefined);
  record.viewport = measureVector(typeof renderer.getViewport === 'function' ? renderer.getViewport.bind(renderer) : undefined);
  record.scissor = measureVector(typeof renderer.getScissor === 'function' ? renderer.getScissor.bind(renderer) : undefined);
  record.scissorTest = measure(typeof renderer.getScissorTest === 'function' ? () => renderer.getScissorTest() : undefined);
  record.sceneSampleRenderReturn = record.renderReturns;
}

/** Call at first render or while the diagnostic panel is open, never per frame.
 * getError is destructive and synchronous; drain at most four entries. */
export function sampleGlDiagnostics(record: FirstPersonDiagnostics, gl: WebGLRenderingContext): void {
  // Installed Expo EXWebGLRenderer.cpp exposes the actual native ES capability;
  // Three's compatibility isWebGL2 flag is not evidence for this field.
  const nativeSupport = (gl as WebGLRenderingContext & { supportsWebGL2?: unknown }).supportsWebGL2;
  record.supportsWebGL2 = typeof nativeSupport === 'boolean' ? nativeSupport : 'unsupported';
  record.framebufferStatus = measure(typeof gl.checkFramebufferStatus === 'function' && typeof gl.FRAMEBUFFER === 'number' ? () => gl.checkFramebufferStatus(gl.FRAMEBUFFER) : undefined);
  record.glVersion = measure(typeof gl.getParameter === 'function' ? () => boundedDiagnosticText(gl.getParameter(gl.VERSION), 160) : undefined);
  record.shaderLanguage = measure(typeof gl.getParameter === 'function' ? () => boundedDiagnosticText(gl.getParameter(gl.SHADING_LANGUAGE_VERSION), 160) : undefined);
  if (typeof gl.getError !== 'function') { if (!record.glErrors.includes('unsupported')) record.glErrors = [...record.glErrors, 'unsupported'].slice(-8); return; }
  try {
    for (let index = 0; index < 4; index += 1) {
      const code = gl.getError();
      if (code === gl.NO_ERROR) break;
      record.glErrors.push(`0x${code.toString(16)}`);
      record.glErrors = record.glErrors.slice(-8);
    }
  } catch { record.glErrors = [...record.glErrors, 'unsupported'].slice(-8); }
}

/** Three replaces its default diagnostic output when this callback is set.
 * Preserve any existing hook and provide the actual program/shader logs. */
export function installShaderDiagnostics(renderer: THREE.WebGLRenderer, record: FirstPersonDiagnostics, onFailure: (error: Error) => void): () => void {
  if (!renderer.debug) return () => undefined;
  const debug = renderer.debug;
  const previous = debug.onShaderError;
  const previousCheck = debug.checkShaderErrors;
  debug.checkShaderErrors = true;
  const handler: NonNullable<THREE.WebGLRenderer['debug']['onShaderError']> = (gl, program, vertex, fragment) => {
    const report = {
      program: boundedDiagnosticText(gl.getProgramInfoLog(program)),
      vertex: boundedDiagnosticText(gl.getShaderInfoLog(vertex)),
      fragment: boundedDiagnosticText(gl.getShaderInfoLog(fragment)),
    };
    record.shaderErrors = [...record.shaderErrors, report].slice(-4);
    const error = new Error(`Shader link failed. Program: ${report.program}\nVertex: ${report.vertex}\nFragment: ${report.fragment}`);
    recordDiagnosticError(record, error, 'shader');
    // The application's failure handler records this original Error in Metro.
    // Retain a pre-existing shader reporter, including its useful full logs.
    try { previous?.(gl, program, vertex, fragment); }
    finally { onFailure(error); }
  };
  debug.onShaderError = handler;
  return () => { if (debug.onShaderError === handler) { debug.onShaderError = previous; debug.checkShaderErrors = previousCheck; } };
}
