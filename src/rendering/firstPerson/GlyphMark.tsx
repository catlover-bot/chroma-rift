/* eslint-disable react/no-unknown-property -- Shared R3F fixture geometry. */
import type { Glyph } from '../../domain/emblem';
import type { SceneResources } from './resources';

export function GlyphMark({ glyph, resources }: { glyph: Glyph; resources: SceneResources }) {
  if (glyph === 'circle') return <mesh name="emblem-glyph-circle" geometry={resources.ring} material={resources.neutral} scale={[0.34 / 0.78, 0.34 / 0.78, 1]} />;
  const side = glyph === 'diamond' ? 0.34 / Math.SQRT2 : 0.34;
  const stroke = 0.022;
  return <group name={`emblem-glyph-${glyph}`} rotation={[0, 0, glyph === 'diamond' ? Math.PI / 4 : 0]}>
    {[-1, 1].map((sign) => <group key={sign}>
      <mesh geometry={resources.plane} material={resources.neutral} position={[0, sign * (side - stroke) / 2, 0]} scale={[side, stroke, 1]} />
      <mesh geometry={resources.plane} material={resources.neutral} position={[sign * (side - stroke) / 2, 0, 0]} scale={[stroke, side - stroke * 2, 1]} />
    </group>)}
  </group>;
}
