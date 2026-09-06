import { chromaticComparison, diagramComparison } from '../illusionComparisons';
import { createShadowSpec, SHADOW_SAMPLE_SIZE } from '../../domain/gallery';
import { rasterizeChromaticExhibit } from '../../rendering/firstPerson/chromaticExhibit';
const options = { seed: 73, neutral: false, rotation: 0, guide: false, offset: .24, cover: 0 };
const pixel = (image: ReturnType<typeof diagramComparison>, x: number, y: number) => {
  const col = Math.floor((x / 2.4 + .5) * image.width), row = Math.floor((.5 - y / 1.8) * image.height);
  return [...image.rgba.slice((row * image.width + col) * 4, (row * image.width + col) * 4 + 4)];
};
it('uses the exact exhibition-number bytes and existing neutral luminance conversion', () => {
  for (const neutral of [false, true]) expect(chromaticComparison(neutral, 'muted')).toEqual(rasterizeChromaticExhibit(256, neutral, 'muted'));
});
it.each([0, 1, 2, 3, 4, 5])('changes only the context of shadow variant %s, preserving every sample interior', seed => {
  const a = diagramComparison('shadow', { ...options, seed }), b = diagramComparison('shadow', { ...options, seed, neutral: true });
  const spec = createShadowSpec(seed);
  for (const sample of spec.samples) { const center = spec.slots[sample.sourceSlot];
    for (const dx of [-SHADOW_SAMPLE_SIZE / 3, 0, SHADOW_SAMPLE_SIZE / 3]) expect(pixel(a, center.x + dx, center.y)).toEqual(pixel(b, center.x + dx, center.y));
    expect(pixel(a, center.x, center.y)).toEqual(sample.rgba);
  }
  expect(a.rgba).not.toEqual(b.rgba);
});
it('keeps the ordinary contour center blank while orientation and explicit guide remain separate', () => {
  const ordinary = diagramComparison('contour', options), rotated = diagramComparison('contour', { ...options, rotation: .5 }), guide = diagramComparison('contour', { ...options, guide: true });
  expect(pixel(ordinary, 0, 0)).toEqual([232, 228, 216, 255]); expect(pixel(rotated, 0, 0)).toEqual([232, 228, 216, 255]);
  expect(ordinary.rgba).not.toEqual(rotated.rgba); expect(ordinary.rgba).not.toEqual(guide.rgba);
});
it('removes only the wiring cover at a fixed offset and makes line-height changes visible', () => {
  const hidden = diagramComparison('wiring', options), exposed = diagramComparison('wiring', { ...options, cover: -.97 }), aligned = diagramComparison('wiring', { ...options, offset: 0, cover: -.97 });
  expect(pixel(hidden, .5, .24 + Math.tan(40 * Math.PI / 180) * .5 - .1)).toEqual(pixel(exposed, .5, .24 + Math.tan(40 * Math.PI / 180) * .5 - .1));
  expect(exposed.rgba).not.toEqual(aligned.rgba); expect(hidden.rgba).not.toEqual(exposed.rgba);
});
