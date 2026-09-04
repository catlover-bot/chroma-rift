export const STIMULUS_COLORS = {
  red: '#FF2A2A',
  blue: '#006BFF',
  darkBackground: '#050507',
  lightBackground: '#F2F2F2',
} as const;

export type StimulusParameters = {
  red: string;
  blue: string;
  strokeWidth: number;
  spacing: number;
  glow: number;
};

export const CALIBRATION_STIMULUS: StimulusParameters = {
  red: STIMULUS_COLORS.red,
  blue: STIMULUS_COLORS.blue,
  strokeWidth: 8,
  spacing: 24,
  glow: 0,
};
