import { effectiveControlMode, firstGuideInstruction, simpleGuideAimInstruction } from '../firstPersonControlMode';

describe('effective first-person control policy', () => {
  it('keeps the ordinary default and explicitly saved button preference', () => {
    expect(effectiveControlMode('simple', false, false, 1)).toEqual({ mode: 'simple', reason: '保存したボタン操作の希望', forced: false });
    expect(effectiveControlMode('standard', false, false, 1)).toEqual({ mode: 'standard', reason: '保存したドラッグ操作の希望', forced: false });
  });
  it.each([[true, 1], [false, 1.5], [true, 2.5]])('keeps saved drag controls with reduced motion %s and font scale %s', (reducedMotion, fontScale) => {
    expect(effectiveControlMode('standard', reducedMotion, false, fontScale)).toEqual({ mode: 'standard', reason: '保存したドラッグ操作の希望', forced: false });
    expect(effectiveControlMode('simple', reducedMotion, false, fontScale).mode).toBe('simple');
  });
  it('temporarily presents screen-reader buttons and recovers the saved touch preference on exit', () => {
    const saved = Object.freeze({ movementMode: 'standard' as const });
    const reader = effectiveControlMode(saved.movementMode, true, true, 2);
    expect(reader.mode).toBe('simple');
    expect(reader.forced).toBe(true);
    expect(reader.reason).toContain('保存した操作設定は変わりません');
    expect(saved.movementMode).toBe('standard');
    expect(effectiveControlMode(saved.movementMode, true, false, 2).mode).toBe('standard');
    expect(effectiveControlMode('simple', false, true, 1).forced).toBe(false);
    expect(effectiveControlMode('simple', false, false, 1).mode).toBe('simple');
  });
  it('introduces the actual movement surface', () => {
    expect(firstGuideInstruction('simple')).toContain('前へ一歩');
    expect(firstGuideInstruction('standard')).toContain('ドラッグ');
  });
  it('names the correct existing horizontal turn button without moving the player', () => {
    const pose = { position: { x: 0, y: 1.6, z: 1 }, yaw: -0.4, pitch: -0.3 };
    const target = { x: 0, y: 1.05, z: -0.7 };
    expect(simpleGuideAimInstruction(pose, target)).toContain('左を向く');
    expect(simpleGuideAimInstruction({ ...pose, yaw: 0.4 }, target)).toContain('右を向く');
    expect(pose).toEqual({ position: { x: 0, y: 1.6, z: 1 }, yaw: -0.4, pitch: -0.3 });
  });
});
