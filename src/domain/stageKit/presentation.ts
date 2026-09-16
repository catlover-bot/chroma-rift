/** Stage-owned meaning layered over the shared physical acquisition result. */
export type StageTargetPresentation = {
  state: 'ready' | 'locked' | 'operating' | 'completed';
  label: string;
  message: string;
};
