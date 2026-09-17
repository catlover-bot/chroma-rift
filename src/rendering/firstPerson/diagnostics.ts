import { boundedDiagnosticText } from '../../platform/diagnosticText';
import * as THREE from 'three';
import type { NativeDefaultFramebufferAdapter } from './nativeDefaultFramebuffer';
import { createGlTraceRecord, createNativeGlObserver, type GlTraceRecord, type NativeGlObserver } from './nativeGlObserver';
import { buildIdentity, DIAGNOSTIC_REVISION } from '../../platform/buildIdentity';

import { inspectPoseSafety, isSafePose } from '../../domain/firstPerson/geometry';
import { stageDefinition } from '../../domain/stageKit/definitions';
import { stageInputPolicy } from '../../domain/stageKit/modules';
import type { PlayerPose, WorldGeometry } from '../../domain/firstPerson/types';
import type { RuntimeController, RuntimeSnapshot } from './controllerTypes';

export { boundedDiagnosticText } from '../../platform/diagnosticText';
export { DIAGNOSTIC_REVISION } from '../../platform/buildIdentity';

export type DiagnosticSceneMode = 'chapter' | 'lab' | 'proof' | 'raw-gl';
export type DiagnosticStage = 'initializing' | 'context-created' | 'renderer-created' | 'scene-committed' | 'first-submitted' | 'ready' | 'failed' | 'closed';
export type Measurement<T> = T | 'unknown' | 'unsupported';
export type DimensionsRecord = { width: number; height: number };
export type DiagnosticError = { phase: string; name: string; message: string; stack: string; componentStack: string };
export type DiagnosticFailure = { reasonCode: string; stageBeforeFailure: DiagnosticStage; atMs: number; elapsedMs: number;
  startupTimeoutMs: number | 'unknown'; startupRemainingMs: number | 'unknown'; readyAtMs: number | null;
  appActive: Measurement<boolean>; paused: boolean;
  frameSequence: number; lastMainRenderFrame: number; lastPresentationFrame: number; lastOffscreenFrame: number;
  renderReturns: number; presentationReturns: number; offscreenPasses: number; activeRendererOwners: number; error: DiagnosticError;
  firstErrorBoundary: GlTraceRecord['firstErrorBoundary']; firstInvalidOperation: GlTraceRecord['firstInvalidOperation'];
  diagnosticQueryFailures: GlTraceRecord['diagnosticQueryFailures'] };
export type ShaderDiagnostic = { program: string; vertex: string; fragment: string };
export type FirstPersonDiagnostics = {
  revision: string; session: number; sceneMode: DiagnosticSceneMode; stage: DiagnosticStage; open: boolean;
  nativeGL: Measurement<boolean>; appActive: Measurement<boolean>; paused: boolean;
  rnLayout: Measurement<DimensionsRecord>; drawingBuffer: Measurement<DimensionsRecord>; pixelRatio: Measurement<number>;
  contextCreates: number; rendererCreates: number; rendererOwnership: 'unknown' | 'live' | 'teardown-only' | 'closed';
  activeRendererOwners: number; startedAtMs: number; frameSequence: number; lastMainRenderFrame: number; lastPresentationFrame: number; lastOffscreenFrame: number;
  startupTimeoutMs: number | 'unknown'; startupRemainingMs: number | 'unknown'; readyAtMs: number | null;
  startupActiveSinceMs: number | null;
  readiness: null | { frame: number; sampled: boolean; layout: boolean; drawingBuffer: boolean; camera: boolean; viewport: boolean;
    sceneDensity: boolean; frustum: boolean; draw: boolean; target: boolean; pose: boolean; shader: boolean; valid: boolean };
  events: { atMs: number; frame: number; event: string }[];
  sceneCommitted: boolean; frameCallbacks: number; simulationTicks: number; renderCalls: number; renderReturns: number; presentationReturns: number; sceneSampleRenderReturn: number;
  offscreenPasses: number; frameOffscreenPasses: number; offscreenTargetSize: Measurement<[number, number]>;
  offscreenTargetConfig: Measurement<{ width: number; height: number; samples: number; depthBuffer: boolean; stencilBuffer: boolean; type: number; format: number }>;
  offscreenFramebufferStatus: Measurement<number>;
  camera: Measurement<{ position: [number, number, number]; yaw: number; pitch: number; aspect: number; near: number; far: number; matricesFinite: boolean; valid: boolean; layers: number }>;
  pose: { insideSolid: Measurement<boolean>; supportedFloor: Measurement<boolean>; safe: Measurement<boolean> };
  scene: { children: number; meshes: number; visibleLayerMeshes: number; frustumCandidateMeshes: number; materials: number; geometries: number; textures: number };
  lastFrame: { drawCalls: Measurement<number>; triangles: Measurement<number>; geometries: Measurement<number>; textures: Measurement<number>; samplePoint: 'after-render-before-native-presentation' | 'after-render-and-native-wrapper-return' | 'not-sampled' };
  renderTarget: Measurement<'default-framebuffer' | 'offscreen-target'>;
  viewport: Measurement<[number, number, number, number]>; scissor: Measurement<[number, number, number, number]>; scissorTest: Measurement<boolean>;
  glVersion: Measurement<string>; shaderLanguage: Measurement<string>; supportsWebGL2: Measurement<boolean>; framebufferStatus: Measurement<number>; glErrors: string[]; shaderErrors: ShaderDiagnostic[];
  glFramebuffer: ReturnType<NativeDefaultFramebufferAdapter['snapshot']> | 'not-installed';
  glTrace: GlTraceRecord;
  lastError: DiagnosticError | null;
  firstFailure: DiagnosticFailure | null;
  failureFrameContext: { pose: PlayerPose; revision: number } | null;
  effectiveControls: { mode: 'unknown' | 'standard' | 'simple'; reason: string };
  pixelEvidence: 'not-sampled' | 'proof-triangle-center-differs-from-clear' | 'proof-center-did-not-match-triangle' | 'unsupported';
  stageKit?: { stageId: string; contentVersion: number | 'unknown'; session: number; revision: number;
    selectedInstanceId: string | null; inputPolicy: ReturnType<typeof stageInputPolicy>; unavailableReason: string | null;
    objective: string; lastCommand: RuntimeController['lastCommand']; actor: unknown; lastSeen: unknown; lastHeard: unknown;
    noiseSource: unknown; renderPasses: number; totalDrawCalls: Measurement<number>; ownedResources: { geometries: number; materials: number; textures: number } };
};
export type DiagnosticSnapshot = FirstPersonDiagnostics;
let nextSession = 0;

export function createFirstPersonDiagnostics(sceneMode: DiagnosticSceneMode = 'chapter'): FirstPersonDiagnostics {
  return {
    revision: DIAGNOSTIC_REVISION, session: ++nextSession, sceneMode, stage: 'initializing', open: false,
    nativeGL: 'unknown', appActive: 'unknown', paused: false, rnLayout: 'unknown', drawingBuffer: 'unknown', pixelRatio: 'unknown',
    contextCreates: 0, rendererCreates: 0, rendererOwnership: 'unknown', activeRendererOwners: 0,
    startedAtMs: Date.now(), frameSequence: 0, lastMainRenderFrame: 0, lastPresentationFrame: 0, lastOffscreenFrame: 0,
    startupTimeoutMs: 'unknown', startupRemainingMs: 'unknown', readyAtMs: null, startupActiveSinceMs: null, readiness: null, events: [], sceneCommitted: false,
    frameCallbacks: 0, simulationTicks: 0, renderCalls: 0, renderReturns: 0, presentationReturns: 0, sceneSampleRenderReturn: 0,
    offscreenPasses: 0, frameOffscreenPasses: 0, offscreenTargetSize: 'unknown', offscreenTargetConfig: 'unknown', offscreenFramebufferStatus: 'unknown', camera: 'unknown',
    pose: { insideSolid: 'unknown', supportedFloor: 'unknown', safe: 'unknown' },
    scene: { children: 0, meshes: 0, visibleLayerMeshes: 0, frustumCandidateMeshes: 0, materials: 0, geometries: 0, textures: 0 },
    lastFrame: { drawCalls: 'unknown', triangles: 'unknown', geometries: 'unknown', textures: 'unknown', samplePoint: 'not-sampled' },
    renderTarget: 'unknown', viewport: 'unknown', scissor: 'unknown', scissorTest: 'unknown',
    glVersion: 'unknown', shaderLanguage: 'unknown', supportsWebGL2: 'unknown', framebufferStatus: 'unknown', glErrors: [], shaderErrors: [], lastError: null, firstFailure: null, failureFrameContext: null,
    glFramebuffer: 'not-installed', glTrace: createGlTraceRecord(), effectiveControls: { mode: 'unknown', reason: 'not-evaluated' }, pixelEvidence: 'not-sampled',
  };
}

export function recordDiagnosticError(record: FirstPersonDiagnostics, error: unknown, phase: string, componentStack?: string | null): void {
  if (record.lastError) return;
  record.lastError = {
    phase: boundedDiagnosticText(phase, 80), name: error instanceof Error ? boundedDiagnosticText(error.name, 80) : 'Error',
    message: boundedDiagnosticText(error instanceof Error ? error.message : error),
    stack: error instanceof Error ? boundedDiagnosticText(error.stack, 2400) : '',
    componentStack: boundedDiagnosticText(componentStack, 1600),
  };
}
export function recordDiagnosticEvent(record: FirstPersonDiagnostics, event: string): void {
  record.events = [...record.events, { atMs: Date.now() - record.startedAtMs, frame: record.frameSequence, event: boundedDiagnosticText(event, 80) }].slice(-12);
}
export function recordFirstFailure(record: FirstPersonDiagnostics, error: unknown, phase: string, reasonCode: string, componentStack?: string | null): void {
  if (record.firstFailure) return;
  sampleStartupTiming(record);
  record.startupActiveSinceMs = null;
  recordDiagnosticError(record, error, phase, componentStack);
  const atMs = Date.now();
  record.firstFailure = { reasonCode, stageBeforeFailure: record.stage, atMs, elapsedMs: Math.max(0, atMs - record.startedAtMs),
    startupTimeoutMs: record.startupTimeoutMs, startupRemainingMs: record.startupRemainingMs, readyAtMs: record.readyAtMs,
    appActive: record.appActive, paused: record.paused,
    frameSequence: record.frameSequence, lastMainRenderFrame: record.lastMainRenderFrame, lastPresentationFrame: record.lastPresentationFrame,
    lastOffscreenFrame: record.lastOffscreenFrame, renderReturns: record.renderReturns, presentationReturns: record.presentationReturns,
    offscreenPasses: record.offscreenPasses, activeRendererOwners: record.activeRendererOwners, error: record.lastError!,
    firstErrorBoundary: record.glTrace.firstErrorBoundary, firstInvalidOperation: record.glTrace.firstInvalidOperation,
    diagnosticQueryFailures: [...record.glTrace.diagnosticQueryFailures] };
  recordDiagnosticEvent(record, `FIRST_FAILURE:${reasonCode}`);
}
/** Preserve the unpresented camera state before the runtime rolls back to its
 * last confirmed frame. This record never enters a checkpoint. */
export function recordFailureFrameContext(record: FirstPersonDiagnostics, pose: PlayerPose, revision: number): void {
  if (record.firstFailure || record.failureFrameContext) return;
  record.failureFrameContext = { pose: { position: { ...pose.position }, yaw: pose.yaw, pitch: pose.pitch }, revision };
}
export function snapshotDiagnostics(record: FirstPersonDiagnostics): FirstPersonDiagnostics {
  // No renderer references or callbacks enter the record; copies cannot mutate
  // the live counters. Consumers refresh at most twice per second while open.
  const snapshot = JSON.parse(JSON.stringify(record)) as FirstPersonDiagnostics;
  sampleStartupTiming(snapshot);
  return snapshot;
}
// Keep preparation and failure copies identifiable without a native GL frame.
// The serialized schema version is independent of the code revision marker.
function diagnosticHeader() {
  const identity = buildIdentity();
  return { schemaVersion: 1,
    app: { version: identity.appVersion, build: identity.nativeBuild, profileMarker: identity.profileMarker,
      bundleSource: identity.bundleSource, code: identity.code } };
}
export function serializeDiagnostics(record: FirstPersonDiagnostics): string {
  return JSON.stringify({ ...diagnosticHeader(), ...snapshotDiagnostics(record) }, null, 2);
}
/** Only this bounded, redacted failure summary is exposed in internal preview.
 * Build/channel are unknown until a native build explicitly supplies them. */
export function serializeFailureDiagnostics(record: FirstPersonDiagnostics, context: { chapterId: string; campaignId?: string; areaId?: string;
  runtimeSession: number; attempt: number; restoreOrigin: 'fresh' | 'checkpoint' | 'retry'; pose: PlayerPose; revision: number }): string {
  const safe = snapshotDiagnostics(record);
  const pose = safe.failureFrameContext?.pose ?? context.pose;
  return JSON.stringify({ label: 'FIRST_FAILURE', ...diagnosticHeader(), revision: safe.revision,
    campaignId: context.campaignId ?? 'unknown', areaId: context.areaId ?? 'unknown', chapterId: boundedDiagnosticText(context.chapterId, 80),
    diagnosticSession: safe.session, runtimeSession: context.runtimeSession, attempt: context.attempt,
    restoreOrigin: context.restoreOrigin, stateRevision: safe.failureFrameContext?.revision ?? context.revision,
    poseSource: safe.failureFrameContext ? 'failed-unpresented-frame' : 'current-controller',
    pose: { x: pose.position.x, y: pose.position.y, z: pose.position.z, yaw: pose.yaw, pitch: pose.pitch },
    stage: safe.stage, firstFailure: safe.firstFailure, events: safe.events,
    startup: { timeoutMs: safe.startupTimeoutMs, remainingMs: safe.startupRemainingMs, readyAtMs: safe.readyAtMs,
      appActive: safe.appActive, paused: safe.paused },
    readiness: safe.readiness,
    frames: { sequence: safe.frameSequence, mainRender: safe.lastMainRenderFrame, presentation: safe.lastPresentationFrame,
      reflection: safe.lastOffscreenFrame, renderReturns: safe.renderReturns, presentationReturns: safe.presentationReturns,
      offscreenPasses: safe.offscreenPasses },
    owners: { activeRendererOwners: safe.activeRendererOwners, rendererCreates: safe.rendererCreates, contextCreates: safe.contextCreates,
      rendererOwnership: safe.rendererOwnership }, target: { config: safe.offscreenTargetConfig, framebufferStatus: safe.offscreenFramebufferStatus },
    gl: { nativeGL: safe.nativeGL, supportsWebGL2: safe.supportsWebGL2,
      framebufferStatus: safe.framebufferStatus, errors: safe.glErrors, shaderErrors: safe.shaderErrors, trace: safe.glTrace, framebufferAdapter: safe.glFramebuffer },
  }, null, 2);
}
export function updateDiagnosticContext(record: FirstPersonDiagnostics, value: Pick<FirstPersonDiagnostics, 'effectiveControls' | 'appActive' | 'paused' | 'sceneMode'>): void {
  Object.assign(record, value);
}
export function setDiagnosticsOpen(record: FirstPersonDiagnostics, open: boolean): void { record.open = open; }
/** Collected only while the developer panel is open; never serialized into a save. */
export function updateStageKitDiagnostics(record: FirstPersonDiagnostics, controller: RuntimeController, snapshot: RuntimeSnapshot): void {
  const runtime=controller.runtime,definition=stageDefinition(runtime.chapterId);
  const actor=runtime.theatre?.actor??runtime.vault?.actor??runtime.gallery?.actor;
  record.stageKit={stageId:runtime.chapterId??'returnless-entrance',contentVersion:definition?.contentVersion??'unknown',session:runtime.session,
    revision:controller.viewCommandRevision,selectedInstanceId:snapshot.target?.id??null,inputPolicy:stageInputPolicy(runtime),
    unavailableReason:snapshot.acquisition?.kind==='ready'?null:snapshot.acquisition?.message??snapshot.cue.reason??null,
    objective:snapshot.objective,lastCommand:controller.lastCommand,actor:actor?.phase??null,lastSeen:actor?.lastSeen??null,lastHeard:runtime.theatre?.actor.lastHeard??runtime.vault?.actor.lastHeard??null,
    noiseSource:runtime.theatre?.environmentNoise?.position??runtime.theatre?.projectorNoise?.position??null,
    renderPasses:record.renderReturns>0?1+record.frameOffscreenPasses:0,totalDrawCalls:record.lastFrame.drawCalls,
    ownedResources:{geometries:record.scene.geometries,materials:record.scene.materials,textures:record.scene.textures}};
}
export function updateDiagnosticEnvironment(record: FirstPersonDiagnostics, value: Partial<Pick<FirstPersonDiagnostics, 'sceneMode' | 'appActive' | 'paused' | 'nativeGL'>>): void { Object.assign(record, value); }
export function recordStartupTiming(record: FirstPersonDiagnostics, timeoutMs: number, remainingMs: number, activeSinceMs: number | null = null): void {
  if (record.firstFailure || record.readyAtMs !== null) return;
  record.startupTimeoutMs = timeoutMs;
  record.startupRemainingMs = remainingMs;
  record.startupActiveSinceMs = activeSinceMs;
}
/** Sample the same active segment used by the Canvas timer. Wall time since
 * controller creation includes pause/background and is not its timeout budget. */
export function sampleStartupTiming(record: FirstPersonDiagnostics): void {
  if (record.firstFailure || record.readyAtMs !== null || record.startupActiveSinceMs === null || typeof record.startupRemainingMs !== 'number') return;
  const now = Date.now();
  record.startupRemainingMs = Math.max(0, record.startupRemainingMs - Math.max(0, now - record.startupActiveSinceMs));
  record.startupActiveSinceMs = now;
}
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

/** Shared observer separates pending render errors from diagnostic query errors.
 * Called at the existing startup/play cadence, never a second getError reader. */
export function sampleGlDiagnostics(record: FirstPersonDiagnostics, gl: WebGLRenderingContext, observer?: NativeGlObserver): void {
  const nativeSupport = (gl as WebGLRenderingContext & { supportsWebGL2?: unknown }).supportsWebGL2;
  record.supportsWebGL2 = typeof nativeSupport === 'boolean' ? nativeSupport : 'unsupported';
  const errors = observer ?? createNativeGlObserver(record, gl, false);
  const before = errors.read('before-inspectGl');
  if (before.errors.length || record.glErrors.some(value => value !== 'unsupported')) return;
  record.framebufferStatus = errors.query('framebuffer-status', typeof gl.checkFramebufferStatus === 'function' && typeof gl.FRAMEBUFFER === 'number' ? () => gl.checkFramebufferStatus(gl.FRAMEBUFFER) : undefined);
  record.glVersion = errors.query('version', typeof gl.getParameter === 'function' && typeof gl.VERSION === 'number' ? () => boundedDiagnosticText(gl.getParameter(gl.VERSION), 160) : undefined);
  record.shaderLanguage = errors.query('shader-language', typeof gl.getParameter === 'function' && typeof gl.SHADING_LANGUAGE_VERSION === 'number' ? () => boundedDiagnosticText(gl.getParameter(gl.SHADING_LANGUAGE_VERSION), 160) : undefined);
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
