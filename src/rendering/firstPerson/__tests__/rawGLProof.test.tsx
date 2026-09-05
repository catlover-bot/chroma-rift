import { act, render } from '@testing-library/react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';

import { createFirstPersonDiagnostics } from '../diagnostics';
import { RawGLProof } from '../RawGLProof';
import { drawRawGLProof } from '../rawGLTriangle';

jest.mock('expo-gl', () => ({ GLView: jest.fn(() => null) }));
const glView = jest.mocked(GLView);
function fakeContext() {
  const order: string[] = [];
  const api = {
    drawingBufferWidth: 390, drawingBufferHeight: 740,
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7,
    DEPTH_TEST: 8, CULL_FACE: 9, BLEND: 10, SCISSOR_TEST: 11, COLOR_BUFFER_BIT: 12, TRIANGLES: 13, RGBA: 14, UNSIGNED_BYTE: 15, NO_ERROR: 0, VERSION: 16, SHADING_LANGUAGE_VERSION: 17,
    createShader: jest.fn((kind: number) => ({ kind })), shaderSource: jest.fn(), compileShader: jest.fn(), getShaderParameter: jest.fn(() => true), getShaderInfoLog: jest.fn(() => ''),
    createProgram: jest.fn(() => ({})), attachShader: jest.fn(), linkProgram: jest.fn(), getProgramParameter: jest.fn(() => true), getProgramInfoLog: jest.fn(() => ''),
    getAttribLocation: jest.fn(() => 0), createBuffer: jest.fn(() => ({})), bindBuffer: jest.fn(), bufferData: jest.fn(), useProgram: jest.fn(), enableVertexAttribArray: jest.fn(), vertexAttribPointer: jest.fn(),
    viewport: jest.fn(), disable: jest.fn(), clearColor: jest.fn(), clear: jest.fn(() => order.push('clear')),
    drawArrays: jest.fn(() => order.push('draw')),
    readPixels: jest.fn((_x: number, _y: number, _width: number, _height: number, _format: number, _type: number, output: Uint8Array) => { output.set([240, 161, 56, 255]); order.push('read'); }),
    getParameter: jest.fn(() => 'contract-test'), getError: jest.fn(() => 0), endFrameEXP: jest.fn(() => order.push('present')),
    deleteShader: jest.fn(), deleteProgram: jest.fn(), deleteBuffer: jest.fn(),
  };
  return { api, gl: api as unknown as ExpoWebGLRenderingContext, order };
}
describe('single-context raw GL proof contract (substituted GL, not GPU verification)', () => {
  it('compiles, links and draws actual vertex data before exactly one presentation, with bounded pre-swap sampling', () => {
    const { api, gl, order } = fakeContext();
    const diagnostics = createFirstPersonDiagnostics('raw-gl');
    const cleanup = drawRawGLProof(gl, diagnostics);
    expect(api.compileShader).toHaveBeenCalledTimes(2); expect(api.linkProgram).toHaveBeenCalledTimes(1);
    expect(api.bufferData.mock.calls[0]?.[1]).toEqual(new Float32Array([-0.8, -0.65, 0.8, -0.65, 0, 0.75]));
    expect(order).toEqual(['clear', 'draw', 'read', 'present']);
    expect(api.endFrameEXP).toHaveBeenCalledTimes(1); expect(api.readPixels).toHaveBeenCalledTimes(1);
    expect(diagnostics.simulationTicks).toBe(0); expect(diagnostics.renderCalls).toBe(1); expect(diagnostics.presentationReturns).toBe(1);
    expect(diagnostics.pixelEvidence).toBe('proof-triangle-center-differs-from-clear');
    cleanup(); cleanup();
    expect(api.deleteBuffer).toHaveBeenCalledTimes(1); expect(api.deleteProgram).toHaveBeenCalledTimes(1); expect(api.deleteShader).toHaveBeenCalledTimes(2);
  });
  it('retains shader compilation failure and tears down allocations without drawing or presenting', () => {
    const { api, gl } = fakeContext();
    api.getShaderParameter.mockReturnValue(false); api.getShaderInfoLog.mockReturnValue('compile failed at vertex line 1');
    const diagnostics = createFirstPersonDiagnostics('raw-gl');
    expect(() => drawRawGLProof(gl, diagnostics)).toThrow('compile failed at vertex line 1');
    expect(diagnostics.lastError?.phase).toBe('raw-gl-proof'); expect(diagnostics.shaderErrors[0]?.vertex).toContain('vertex line 1');
    expect(diagnostics.stage).toBe('failed'); expect(api.drawArrays).not.toHaveBeenCalled(); expect(api.endFrameEXP).not.toHaveBeenCalled();
    expect(api.deleteShader).toHaveBeenCalledTimes(1);
  });
  it('does not mark a zero-size context or failed GL draw as completed', () => {
    const zero = fakeContext(); zero.api.drawingBufferWidth = 0;
    expect(() => drawRawGLProof(zero.gl, createFirstPersonDiagnostics('raw-gl'))).toThrow('zero-sized');
    expect(zero.api.createShader).not.toHaveBeenCalled();
    const failed = fakeContext(); failed.api.getError.mockReturnValue(0x0502);
    const diagnostics = createFirstPersonDiagnostics('raw-gl');
    expect(() => drawRawGLProof(failed.gl, diagnostics)).toThrow('0x502');
    expect(failed.api.endFrameEXP).not.toHaveBeenCalled(); expect(diagnostics.stage).toBe('failed');
    expect(diagnostics.glErrors).toHaveLength(4);
  });
  it('can present even when optional readback is unsupported, recording that limit explicitly', () => {
    const { api, gl } = fakeContext(); api.readPixels.mockImplementation(() => { throw new Error('unsupported readback'); });
    const diagnostics = createFirstPersonDiagnostics('raw-gl');
    const cleanup = drawRawGLProof(gl, diagnostics);
    expect(api.endFrameEXP).toHaveBeenCalledTimes(1); expect(diagnostics.pixelEvidence).toBe('unsupported');
    cleanup();
  });
  it('waits for foreground, draws once, and ignores context callbacks from an exited mount', async () => {
    glView.mockClear();
    const { api, gl } = fakeContext();
    const diagnostics = createFirstPersonDiagnostics('raw-gl');
    const onComplete = jest.fn(); const onError = jest.fn();
    const view = await render(<RawGLProof diagnostics={diagnostics} appActive={false} onComplete={onComplete} onError={onError} />);
    const created = glView.mock.calls[0]![0].onContextCreate;
    await act(() => created(gl)); expect(api.drawArrays).not.toHaveBeenCalled();
    await view.rerender(<RawGLProof diagnostics={diagnostics} appActive onComplete={onComplete} onError={onError} />);
    expect(api.drawArrays).toHaveBeenCalledTimes(1); expect(onComplete).toHaveBeenCalledTimes(1);
    await view.rerender(<RawGLProof diagnostics={diagnostics} appActive onComplete={onComplete} onError={onError} />);
    await act(() => created(gl)); expect(api.drawArrays).toHaveBeenCalledTimes(1);
    await view.unmount(); expect(api.deleteProgram).toHaveBeenCalledTimes(1); expect(diagnostics.stage).toBe('closed');
    const late = fakeContext(); await act(() => created(late.gl)); expect(late.api.drawArrays).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
  it('bounds startup waiting using foreground time and rejects a context arriving after failure', async () => {
    jest.useFakeTimers(); glView.mockClear();
    try {
      const diagnostics = createFirstPersonDiagnostics('raw-gl'); const onError = jest.fn();
      const view = await render(<RawGLProof diagnostics={diagnostics} appActive onError={onError} />);
      const created = glView.mock.calls[0]![0].onContextCreate;
      await act(async () => { await jest.advanceTimersByTimeAsync(6000); });
      await view.rerender(<RawGLProof diagnostics={diagnostics} appActive={false} onError={onError} />);
      await act(async () => { await jest.advanceTimersByTimeAsync(30000); }); expect(onError).not.toHaveBeenCalled();
      await view.rerender(<RawGLProof diagnostics={diagnostics} appActive onError={onError} />);
      await act(async () => { await jest.advanceTimersByTimeAsync(6000); });
      expect(onError).toHaveBeenCalledTimes(1); expect(diagnostics.lastError?.phase).toBe('raw-gl-proof-timeout');
      const late = fakeContext(); await act(() => created(late.gl)); expect(late.api.drawArrays).not.toHaveBeenCalled();
      await view.unmount(); expect(diagnostics.stage).toBe('failed');
    } finally { jest.useRealTimers(); }
  });
});
