import { CONTOUR_BACKGROUND, CONTOUR_INK, contourInkAt, createContourSpec, createShadowSpec, SHADOW_BACKGROUND, SHADOW_CONTEXTS, SHADOW_SAMPLE_SIZE, SHADOW_SLOT_POSITIONS } from '../../domain/gallery';
import type { DiscAngles, ShadowCheckpoint } from '../../domain/gallery';
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function shadowBackdropColor(x: number, y: number, comparison: boolean): string {
  if (comparison) return SHADOW_BACKGROUND;
  const context = SHADOW_CONTEXTS.find(c => Math.abs(x - c.x) <= c.width / 2 && Math.abs(y - c.y) <= c.height / 2);
  return context?.color ?? SHADOW_BACKGROUND;
}
/** Top-down opaque sRGB raster. Geometry/positions and sample colors come
 * from the same domain records that feed the native meshes. */
export function galleryRaster(kind: 'shadow' | 'contour', size: number, options: { shadow?: ShadowCheckpoint; angles?: DiscAngles; compare?: boolean; guide?: boolean; samples?: boolean } = {}) {
  if (!Number.isInteger(size) || size < 128 || size > 1024) throw new RangeError('Invalid gallery raster size');
  const width = size, height = Math.round(size * 1.8 / 2.4), rgba = new Uint8Array(width * height * 4);
  const spec = options.shadow ? createShadowSpec(options.shadow.seed, options.shadow.variant) : undefined;
  const contour = createContourSpec(0);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const x = ((col + .5) / width - .5) * 2.4, y = (.5 - (row + .5) / height) * 1.8;
    let color = kind === 'shadow' ? shadowBackdropColor(x, y, !!options.compare) : CONTOUR_BACKGROUND;
    if (kind === 'shadow' && options.samples !== false && spec && options.shadow) {
      for (const sample of spec.samples) {
        const p = SHADOW_SLOT_POSITIONS[options.shadow.assignments[sample.id]];
        if (Math.abs(x - p.x) <= SHADOW_SAMPLE_SIZE / 2 && Math.abs(y - p.y) <= SHADOW_SAMPLE_SIZE / 2) color = sample.color;
      }
    }
    if (kind === 'contour' && options.angles && contourInkAt({ x, y }, options.angles)) color = CONTOUR_INK;
    if (kind === 'contour' && options.guide) {
      for (let i = 0; i < 3; i++) {
        const a = contour.discs[i]!.center, b = contour.discs[(i + 1) % 3]!.center;
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        const along = ((x - a.x) * dx + (y - a.y) * dy) / length;
        if (along > 0 && along < length && Math.abs((x - a.x) * dy - (y - a.y) * dx) / length < .006 && Math.floor(along / .065) % 2 === 0) color = '#8A6540';
      }
    }
    const offset = (row * width + col) * 4, c = rgb(color);
    rgba[offset] = c[0]!; rgba[offset + 1] = c[1]!; rgba[offset + 2] = c[2]!; rgba[offset + 3] = 255;
  }
  return { width, height, rgba };
}
