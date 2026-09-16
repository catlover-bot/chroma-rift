import { Shape, ShapeGeometry } from 'three';

/** The inner edge of the left profile also IS the key's left contour.
 * No image substitution or alternate solved outline exists. */
export const ISOLATION_KEY_PROFILE: readonly (readonly [number, number])[] = [
  [-.20, -.35], [-.22, -.24], [-.13, -.14], [-.10, -.06],
  [-.18, -.022], [-.14, .015], [-.21, .08], [-.18, .16], [-.28, .28], [-.28, .35],
];

export function isolationKeyGeometry(): ShapeGeometry {
  const key = new Shape();
  const [first, ...rest] = ISOLATION_KEY_PROFILE;
  key.moveTo(first![0], first![1]);
  rest.forEach(([x, y]) => key.lineTo(x, y));
  [...ISOLATION_KEY_PROFILE].reverse().forEach(([x, y]) => key.lineTo(-x, y));
  key.closePath();
  return new ShapeGeometry(key);
}
