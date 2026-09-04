import type { MazeScore } from './types';

export const INITIAL_MAZE_SCORE: MazeScore = {
  score: 0,
  correctCount: 0,
  currentCombo: 0,
  bestCombo: 0,
  decisions: 0,
};

export function scoreMazeDecision(previous: MazeScore, correct: boolean): MazeScore {
  if (!correct) {
    return {
      ...previous,
      currentCombo: 0,
      decisions: previous.decisions + 1,
    };
  }

  const currentCombo = previous.currentCombo + 1;
  return {
    score: previous.score + 100 + 25 * Math.max(0, currentCombo - 1),
    correctCount: previous.correctCount + 1,
    currentCombo,
    bestCombo: Math.max(previous.bestCombo, currentCombo),
    decisions: previous.decisions + 1,
  };
}
