import { findNearestEligibleRail } from '../geometry';
import { INITIAL_MAZE_SCORE, scoreMazeDecision } from '../scoring';
import type { RailPath } from '../types';

const rails: RailPath[] = [
  { id: 'red', junctionIndex: 0, color: 'red', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  { id: 'blue', junctionIndex: 0, color: 'blue', points: [{ x: 0, y: 30 }, { x: 100, y: 30 }] },
];

describe('maze scoring', () => {
  it('scores correct decisions and combo bonuses', () => {
    const one = scoreMazeDecision(INITIAL_MAZE_SCORE, true);
    const two = scoreMazeDecision(one, true);
    const three = scoreMazeDecision(two, true);
    expect([one.score, two.score, three.score]).toEqual([100, 225, 375]);
    expect(three.bestCombo).toBe(3);
  });

  it('resets the combo after an incorrect selection', () => {
    const correct = scoreMazeDecision(INITIAL_MAZE_SCORE, true);
    const incorrect = scoreMazeDecision(correct, false);
    expect(incorrect.currentCombo).toBe(0);
    expect(incorrect.score).toBe(100);
  });

  it('is independent of Depth Assist state', () => {
    const withoutAssist = scoreMazeDecision(INITIAL_MAZE_SCORE, true);
    const withAssist = scoreMazeDecision(INITIAL_MAZE_SCORE, true);
    expect(withAssist).toEqual(withoutAssist);
  });
});

describe('rail hit testing', () => {
  it('chooses the nearest eligible path', () => {
    expect(findNearestEligibleRail({ x: 50, y: 24 }, rails, 28)?.color).toBe('blue');
  });

  it('rejects taps outside the accepted radius', () => {
    expect(findNearestEligibleRail({ x: 50, y: 80 }, rails, 28)).toBeUndefined();
  });
});
