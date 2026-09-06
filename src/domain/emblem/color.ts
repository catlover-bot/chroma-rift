/** Port of the supplied preview's seal/color core; bytes are encoded sRGB. */
export type RGB = readonly [number, number, number];
export type Presentation = 'color' | 'neutral';
export const PALETTES = Object.freeze({
  baseline: { id: 'baseline', red: '#EF3F48', blue: '#246AF0', background: '#0B0D12' },
  muted: { id: 'muted', red: '#B74C55', blue: '#4E75AA', background: '#151821' },
  alternate: { id: 'alternate', red: '#E6333A', blue: '#0085ED', background: '#0B0D12' },
} as const);
export const PALETTE_IDS = ['baseline', 'muted', 'alternate'] as const;
export type PaletteId = typeof PALETTE_IDS[number];
export const PALETTE_LABELS: Record<PaletteId, string> = { baseline: '表示A', muted: '控えめ', alternate: '表示B' };
export function parseHex(hex: string): RGB {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new RangeError('Expected a six-digit sRGB color.');
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
export function srgbToLinear(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 255) throw new RangeError('Invalid sRGB channel.');
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function linearToSrgb(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1 + 1e-12) throw new RangeError('Invalid linear channel.');
  const c = Math.min(1, value);
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
}
export function relativeLuminance(rgb: RGB): number {
  return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}
export function neutralRGB(rgb: RGB): RGB {
  const value = linearToSrgb(relativeLuminance(rgb));
  return [value, value, value];
}
export function sampleColor(background: RGB, foreground: RGB, coverage: number, mode: Presentation): RGB {
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) throw new RangeError('Invalid coverage.');
  const mixed = background.map((value, channel) => linearToSrgb(srgbToLinear(value) * (1 - coverage) + srgbToLinear(foreground[channel]!) * coverage)) as unknown as RGB;
  return mode === 'neutral' ? neutralRGB(mixed) : mixed;
}
