import { Shape, ShapeGeometry } from 'three';

/** The same physical key silhouette is lifted from area 04 and installed in 05. */
export function isolationKeyGeometry(): ShapeGeometry {
  const key = new Shape();
  key.moveTo(-.05, .09);
  key.bezierCurveTo(-.16, .11, -.16, .29, 0, .29);
  key.bezierCurveTo(.16, .29, .16, .11, .05, .09);
  key.lineTo(.05, -.07); key.lineTo(.12, -.07); key.lineTo(.12, -.13);
  key.lineTo(.05, -.13); key.lineTo(.05, -.18); key.lineTo(.11, -.18);
  key.lineTo(.11, -.24); key.lineTo(-.05, -.24); key.closePath();
  return new ShapeGeometry(key);
}
