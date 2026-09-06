import type { PlayerPose, Vec3 } from './types';

export const TUTORIAL_MOVE_DISTANCE = 0.65;
export const TUTORIAL_LOOK_RADIANS = 0.24;
export type TutorialMilestones = { moved: boolean; looked: boolean; guideExamined: boolean; complete: boolean };
export type TutorialTracker = { milestones: TutorialMilestones; origin: Vec3; userLookRadians: number };

export function createTutorial(pose: PlayerPose, completed = false, guideExamined = false): TutorialTracker {
  return { origin: { ...pose.position }, userLookRadians: 0,
    milestones: { moved: completed, looked: completed, guideExamined, complete: completed || guideExamined } };
}

/** Called only with post-collision movement and an actual user-driven look.
 * Renderer synchronization, menus, color changes and aim assistance never call
 * this with artificial pose changes. Milestones remain independent. */
export function recordTutorialMotion(tracker: TutorialTracker, before: PlayerPose, after: PlayerPose, userLook: boolean): void {
  if (tracker.milestones.complete) return;
  const displacement = Math.hypot(after.position.x - tracker.origin.x, after.position.z - tracker.origin.z);
  const yaw = Math.atan2(Math.sin(after.yaw - before.yaw), Math.cos(after.yaw - before.yaw));
  const look = userLook ? Math.hypot(yaw, after.pitch - before.pitch) : 0;
  if (Number.isFinite(look)) tracker.userLookRadians += look;
  const moved = tracker.milestones.moved || (Number.isFinite(displacement) && displacement >= TUTORIAL_MOVE_DISTANCE);
  const looked = tracker.milestones.looked || tracker.userLookRadians >= TUTORIAL_LOOK_RADIANS;
  if (moved !== tracker.milestones.moved || looked !== tracker.milestones.looked) tracker.milestones = { ...tracker.milestones, moved, looked, complete: moved && looked };
}

/** Retained only for the independent diagnostic lab and legacy introductions. */
export function recordTutorialGuide(tracker: TutorialTracker): void {
  tracker.milestones = { ...tracker.milestones, guideExamined: true, complete: true };
}
