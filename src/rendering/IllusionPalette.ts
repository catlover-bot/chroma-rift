import { neutralizeColor } from '../domain/illusion';

/** Display-only mapping: graph, projection, occlusion, and collectibles never depend on it. */
export type PreferredColor = 'red' | 'blue' | 'neutral';

export function illusionPalette(preferred: PreferredColor, neutral: boolean, strength: 'low' | 'medium' | 'high') {
  const colors = strength === 'low' ? ['#B54950', '#437CBA'] : strength === 'high' ? ['#F04450', '#287BF1'] : ['#D64350', '#377CD5'];
  if (preferred === 'blue') colors.reverse();
  return colors.map((color) => neutral ? neutralizeColor(color) : color);
}
