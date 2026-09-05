import { effectiveControlMode, firstGuideInstruction, simpleGuideAimInstruction } from '../firstPersonControlMode';

describe('effective first-person control policy', () => {
  it('distinguishes a saved simple preference from automatic conditions', () => {
    expect(effectiveControlMode('simple', false, false, 1)).toEqual({ mode: 'simple', reason: '保存した簡単操作の希望', forced: false });
    expect(effectiveControlMode('standard', false, false, 1)).toEqual({ mode: 'standard', reason: '保存した標準操作の希望', forced: false });
  });
  it('names every active accessibility condition without altering the requested mode', () => {
    expect(effectiveControlMode('standard', true, true, 1.5)).toEqual({ mode: 'simple', reason: '動きを減らす設定・画面の読み上げ・文字の拡大', forced: true });
    expect(effectiveControlMode('standard', false, false, 1.49).mode).toBe('standard');
    expect(effectiveControlMode('standard', false, false, 1.5)).toEqual({ mode: 'simple', reason: '文字の拡大', forced: true });
  });
  it('introduces the actual movement surface', () => {
    expect(firstGuideInstruction('simple')).toContain('前へ一歩');
    expect(firstGuideInstruction('standard')).toContain('スティック');
  });
  it('names the correct existing horizontal turn button without moving the player', () => {
    const pose = { position: { x: 0, y: 1.6, z: 1 }, yaw: -0.4, pitch: -0.3 };
    const target = { x: 0, y: 1.05, z: -0.7 };
    expect(simpleGuideAimInstruction(pose, target)).toContain('左を向く');
    expect(simpleGuideAimInstruction({ ...pose, yaw: 0.4 }, target)).toContain('右を向く');
    expect(pose).toEqual({ position: { x: 0, y: 1.6, z: 1 }, yaw: -0.4, pitch: -0.3 });
  });
});
