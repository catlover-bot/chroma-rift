/** Authoring values, not measured human motion. Chapter AI supplies speed and
 * conditions; this shared layer cannot strengthen an older chapter's attacks. */
export const ACTOR_MOTION = Object.freeze({
  fixedStep: 1 / 120, maxDelta: .25,
  bodyMaxYawRate: 120 * Math.PI / 180, bodyMaxYawAcceleration: 480 * Math.PI / 180,
  headMaxYawRate: 220 * Math.PI / 180, headYawLimit: 58 * Math.PI / 180, headPitchLimit: 18 * Math.PI / 180,
  chestYawLimit: 24 * Math.PI / 180, chestDelay: .16, pelvisDelay: .30,
  startAnticipation: .24, linearAcceleration: 2.8, linearDeceleration: 4.2,
  footHalfSpacing: .105, footReach: .27, footLift: .045, turnReplantAngle: 20 * Math.PI / 180,
  stride: { idle: .24, listen: .24, patrol: .32, investigate: .28, notice: .24, pursue: .38, windup: .24, attack: .30, recover: .24, search: .25, return: .30 },
});
