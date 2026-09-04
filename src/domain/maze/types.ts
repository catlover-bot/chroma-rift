export type RailColor = 'red' | 'blue';

export type Point = { x: number; y: number };

export type RailPath = {
  id: string;
  junctionIndex: number;
  color: RailColor;
  points: readonly Point[];
};

export type MazeScore = {
  score: number;
  correctCount: number;
  currentCombo: number;
  bestCombo: number;
  decisions: number;
};

export type MazeLevel = {
  id: 'validation-stage';
  junctionCount: 3;
  targetSequence: readonly [RailColor, RailColor, RailColor];
};
