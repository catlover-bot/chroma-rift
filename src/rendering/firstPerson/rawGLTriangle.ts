import type { ExpoWebGLRenderingContext } from 'expo-gl';

import { boundedDiagnosticText, recordContextDiagnostics, recordDiagnosticError, sampleGlDiagnostics, type FirstPersonDiagnostics } from './diagnostics';

const VERTEX_SOURCE = 'attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }';
const FRAGMENT_SOURCE = 'precision mediump float; void main() { gl_FragColor = vec4(0.94, 0.63, 0.22, 1.0); }';

/** One explicit raw-GL proof draw on its own GLView context. No RAF/R3F loop.
 * readPixels samples one controlled point before endFrameEXP; it says nothing
 * about chapter pixels or whether iOS composited the view on the display. */
export function drawRawGLProof(gl: ExpoWebGLRenderingContext, diagnostics: FirstPersonDiagnostics): () => void {
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
  };
  try {
    recordContextDiagnostics(diagnostics, gl);
    diagnostics.rendererOwnership = 'live';
    diagnostics.stage = 'context-created';
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (!(width > 0 && height > 0)) throw new Error('Raw GL proof has a zero-sized drawing buffer');
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Raw GL proof could not allocate a shader');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = boundedDiagnosticText(gl.getShaderInfoLog(shader));
        diagnostics.shaderErrors.push({ program: '', vertex: kind === gl.VERTEX_SHADER ? log : '', fragment: kind === gl.FRAGMENT_SHADER ? log : '' });
        diagnostics.shaderErrors = diagnostics.shaderErrors.slice(-4);
        throw new Error(`Raw GL proof shader compilation failed: ${log}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    program = gl.createProgram();
    if (!program) throw new Error('Raw GL proof could not allocate a program');
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = boundedDiagnosticText(gl.getProgramInfoLog(program));
      diagnostics.shaderErrors.push({ program: log, vertex: '', fragment: '' });
      diagnostics.shaderErrors = diagnostics.shaderErrors.slice(-4);
      throw new Error(`Raw GL proof program link failed: ${log}`);
    }
    const position = gl.getAttribLocation(program, 'position');
    if (position < 0) throw new Error('Raw GL proof position attribute is unavailable');
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('Raw GL proof could not allocate a vertex buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.8, -0.65, 0.8, -0.65, 0, 0.75]), gl.STATIC_DRAW);
    gl.useProgram(program); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0.08, 0.12, 0.18, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    diagnostics.sceneCommitted = true;
    diagnostics.stage = 'scene-committed';
    diagnostics.renderCalls += 1;
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    diagnostics.renderReturns += 1;
    diagnostics.stage = 'first-submitted';
    diagnostics.lastFrame = { drawCalls: 1, triangles: 1, geometries: 'unsupported', textures: 0, samplePoint: 'after-render-before-native-presentation' };
    diagnostics.viewport = [0, 0, width, height]; diagnostics.scissorTest = false; diagnostics.renderTarget = 'default-framebuffer';
    sampleGlDiagnostics(diagnostics, gl);
    if (diagnostics.glErrors.some((error) => error !== 'unsupported')) throw new Error(`Raw GL proof error: ${diagnostics.glErrors.join(', ')}`);
    const pixel = new Uint8Array(4);
    try {
      gl.readPixels(Math.floor(width / 2), Math.floor(height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      diagnostics.pixelEvidence = pixel[0]! > 150 && pixel[1]! > 80 && pixel[2]! < 120 ? 'proof-triangle-center-differs-from-clear' : 'proof-center-did-not-match-triangle';
      if (gl.getError() !== gl.NO_ERROR) diagnostics.pixelEvidence = 'unsupported';
    } catch { diagnostics.pixelEvidence = 'unsupported'; }
    gl.endFrameEXP();
    diagnostics.presentationReturns += 1;
    diagnostics.stage = 'ready';
    return dispose;
  } catch (error) {
    diagnostics.stage = 'failed';
    recordDiagnosticError(diagnostics, error, 'raw-gl-proof');
    dispose();
    throw error;
  }
}
