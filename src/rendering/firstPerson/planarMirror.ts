import {
  DoubleSide, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Plane, ShaderMaterial,
  Vector3, Vector4, WebGLRenderTarget, type Scene, type WebGLRenderer,
} from 'three';

export const MIRROR_TARGET_SIZE = 384;
export type OffscreenDraw = (renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, width: number, height: number) => void;

/** A single offscreen pass borrowed from the native Canvas owner. Camera and
 * oblique clip math follow the installed Three Reflector, while presentation
 * remains with R3F's one main render. */
export function createPlanarMirror(size = MIRROR_TARGET_SIZE) {
  if (!Number.isSafeInteger(size) || size < 128 || size > 1024) throw new RangeError('Invalid mirror target size');
  const target = new WebGLRenderTarget(size, size, { samples: 0, depthBuffer: true, stencilBuffer: false,
    minFilter: LinearFilter, magFilter: LinearFilter });
  target.texture.generateMipmaps = false;
  const textureMatrix = new Matrix4();
  const material = new ShaderMaterial({
    name: 'chroma-rift-planar-mirror', side: DoubleSide, transparent: false, depthWrite: true,
    uniforms: { tDiffuse: { value: target.texture }, textureMatrix: { value: textureMatrix } },
    vertexShader: `uniform mat4 textureMatrix;
      varying vec4 vMirrorCoord;
      void main() {
        vMirrorCoord = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      varying vec4 vMirrorCoord;
      void main() {
        gl_FragColor = texture2DProj(tDiffuse, vMirrorCoord);
        #include <colorspace_fragment>
      }`,
  });
  // The reflective texture is meaningful only after this frame's offscreen
  // draw. A visible back face must never advertise an old actor position.
  const fallbackMaterial = new MeshBasicMaterial({ name: 'chroma-rift-mirror-unavailable', color: '#263331', side: DoubleSide });
  const camera = new PerspectiveCamera();
  const mirrorPosition = new Vector3(), eyePosition = new Vector3(), normal = new Vector3();
  const rotation = new Matrix4(), view = new Vector3(), lookAt = new Vector3(), reflectedTarget = new Vector3();
  const plane = new Plane(), clip = new Vector4(), q = new Vector4();
  const viewport = new Vector4(), scissor = new Vector4();
  let disposed = false;
  return {
    target, material, fallbackMaterial, camera,
    render(renderer: WebGLRenderer, scene: Scene, mainCamera: PerspectiveCamera, mirror: Mesh, draw: OffscreenDraw): boolean {
      if (disposed) throw new Error('Mirror target was disposed');
      mirror.updateWorldMatrix(true, false);
      mainCamera.updateMatrixWorld(true);
      mirrorPosition.setFromMatrixPosition(mirror.matrixWorld);
      eyePosition.setFromMatrixPosition(mainCamera.matrixWorld);
      rotation.extractRotation(mirror.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotation);
      view.subVectors(mirrorPosition, eyePosition);
      // At or behind the plane the oblique projection is undefined. The caller
      // presents the opaque backing material for this frame instead.
      if (view.dot(normal) >= -0.02) return false;

      view.reflect(normal).negate().add(mirrorPosition);
      rotation.extractRotation(mainCamera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rotation).add(eyePosition);
      reflectedTarget.subVectors(mirrorPosition, lookAt).reflect(normal).negate().add(mirrorPosition);
      camera.position.copy(view);
      camera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      camera.lookAt(reflectedTarget);
      camera.near = mainCamera.near;
      camera.far = mainCamera.far;
      camera.updateMatrixWorld(true);
      camera.projectionMatrix.copy(mainCamera.projectionMatrix);
      textureMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
        .multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(mirror.matrixWorld);

      plane.setFromNormalAndCoplanarPoint(normal, mirrorPosition).applyMatrix4(camera.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const projection = camera.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + projection[8]!) / projection[0]!,
        (Math.sign(clip.y) + projection[9]!) / projection[5]!, -1, (1 + projection[10]!) / projection[14]!);
      const divisor = clip.dot(q);
      if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-6) throw new Error('Mirror clipping plane is invalid');
      clip.multiplyScalar(2 / divisor);
      projection[2] = clip.x;
      projection[6] = clip.y;
      projection[10] = clip.z + 1 - .003;
      projection[14] = clip.w;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      const previousTarget = renderer.getRenderTarget();
      renderer.getViewport(viewport);
      renderer.getScissor(scissor);
      const previousScissorTest = renderer.getScissorTest();
      const previousVisible = mirror.visible;
      const previousXr = renderer.xr.enabled;
      const previousShadowUpdate = renderer.shadowMap.autoUpdate;
      try {
        mirror.visible = false;
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, size, size);
        renderer.setScissor(0, 0, size, size);
        renderer.setScissorTest(false);
        // WebGLRenderer clears depth for the offscreen render (or clear() below).
        // Avoid changing its private depth-mask cache outside that owner.
        if (!renderer.autoClear) renderer.clear();
        draw(renderer, scene, camera, size, size);
        return true;
      } finally {
        mirror.visible = previousVisible;
        renderer.xr.enabled = previousXr;
        renderer.shadowMap.autoUpdate = previousShadowUpdate;
        renderer.setRenderTarget(previousTarget);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(previousScissorTest);
      }
    },
    dispose() { if (!disposed) { disposed = true; material.dispose(); fallbackMaterial.dispose(); target.dispose(); } },
  };
}
