import type { CollisionVolume, Vec3 } from './types';

export type PanelSurface = {
  center: Vec3; width: number; height: number; normal: Vec3; right: Vec3; maxDistance: number;
};
export type PanelPart = { name: string; position: [number, number, number]; scale: [number, number, number] };
export type PanelFixtureDefinition = PanelSurface & {
  frameWidth: number; frameHeight: number; up: Vec3;
  backing: PanelPart; frames: readonly PanelPart[];
};

/** Local z=0 is both the opaque stimulus plane and the interaction plane.
 * Backing has a 20mm air gap; four frame rails leave a 4mm clear aperture.
 * None of these offsets depend on presentation, palette, answer or camera. */
export function createPanelFixture(surface: PanelSurface & { frameWidth?: number; frameHeight?: number }): PanelFixtureDefinition {
  const { width, height, normal: n, right: r } = surface;
  const frameWidth = surface.frameWidth ?? width + 0.16;
  const frameHeight = surface.frameHeight ?? height + 0.16;
  const clearance = 0.004, railX = (frameWidth - width) / 2 - clearance, railY = (frameHeight - height) / 2 - clearance;
  const unit = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
  if (![width, height, frameWidth, frameHeight, surface.maxDistance, ...Object.values(surface.center), ...Object.values(n), ...Object.values(r)].every(Number.isFinite)
    || width <= 0 || height <= 0 || railX <= 0 || railY <= 0 || surface.maxDistance <= 0
    || Math.abs(unit(n) - 1) > 1e-8 || Math.abs(unit(r) - 1) > 1e-8 || Math.abs(n.x * r.x + n.y * r.y + n.z * r.z) > 1e-8) {
    throw new Error('Panel fixture requires positive dimensions and an orthonormal surface basis');
  }
  const up = { x: n.y * r.z - n.z * r.y, y: n.z * r.x - n.x * r.z, z: n.x * r.y - n.y * r.x };
  const frames: PanelPart[] = [];
  for (const sign of [-1, 1]) {
    frames.push({ name: 'horizontal-' + sign, position: [0, sign * (height / 2 + clearance + railY / 2), -0.005], scale: [frameWidth, railY, 0.05] });
    frames.push({ name: 'vertical-' + sign, position: [sign * (width / 2 + clearance + railX / 2), 0, -0.005], scale: [railX, height + 2 * clearance, 0.05] });
  }
  return { ...surface, frameWidth, frameHeight, up,
    backing: { name: 'backing', position: [0, 0, -0.055], scale: [frameWidth, frameHeight, 0.07] }, frames };
}

export function panelPoint(fixture: PanelFixtureDefinition, x: number, y: number, z = 0): Vec3 {
  const c = fixture.center, r = fixture.right, u = fixture.up, n = fixture.normal;
  return { x: c.x + r.x * x + u.x * y + n.x * z, y: c.y + r.y * x + u.y * y + n.y * z, z: c.z + r.z * x + u.z * y + n.z * z };
}

/** The same assembled fixture supplies the existing solid obstacle envelope.
 * This volume is not rendered as another opaque box over the stimulus. */
export function panelFixtureSolid(id: string, fixture: PanelFixtureDefinition): CollisionVolume {
  const points = [fixture.backing, ...fixture.frames].flatMap(part => [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z =>
    panelPoint(fixture, part.position[0] + x * part.scale[0] / 2, part.position[1] + y * part.scale[1] / 2, part.position[2] + z * part.scale[2] / 2)))));
  return { id, kind: 'device', opaque: true,
    min: { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)), z: Math.min(...points.map(p => p.z)) },
    max: { x: Math.max(...points.map(p => p.x)), y: Math.max(...points.map(p => p.y)), z: Math.max(...points.map(p => p.z)) } };
}
