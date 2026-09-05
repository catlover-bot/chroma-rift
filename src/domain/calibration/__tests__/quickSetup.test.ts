import { completeQuickSetup, QUICK_SETUP_ANSWERS, skipQuickSetup } from '../quickSetup';
import { segmentsWithSymmetricGaps } from '../stimulusGeometry';

describe('three-tap product setup', () => {
  for (const a of QUICK_SETUP_ANSWERS) for (const b of QUICK_SETUP_ANSWERS) for (const c of QUICK_SETUP_ANSWERS) {
    it(`uses only the provisional direction rule for ${a}, ${b}, ${c}`, () => {
      const answers = [a, b, c];
      const result = completeQuickSetup(answers, '2026-09-05');
      const red = answers.filter((answer) => answer === 'redFront').length;
      const blue = answers.filter((answer) => answer === 'blueFront').length;
      expect(result.provisionalColor).toBe(red >= 2 && blue === 0 ? 'red' : blue >= 2 && red === 0 ? 'blue' : 'neutral');
      expect(result.suggestDepthAssist).toBe(result.provisionalColor === 'neutral');
      expect(result).not.toHaveProperty('strength');
      expect(result).not.toHaveProperty('confidence');
      expect(result).not.toHaveProperty('backgroundReversalObserved');
    });
  }
  it('accepts exactly three answers and never extends a setup', () => {
    expect(() => completeQuickSetup(['redFront', 'redFront'], '')).toThrow();
    expect(() => completeQuickSetup(['unclear', 'unclear', 'unclear', 'unclear'], '')).toThrow();
  });
  it('offers assist on skip without inventing responses or intensity', () => {
    expect(skipQuickSetup('now')).toMatchObject({ status: 'skipped', answers: [], provisionalColor: 'neutral', suggestDepthAssist: true });
  });
});

describe('detailed stimulus crossing gaps', () => {
  it('leaves identical empty intervals in both crossing orientations', () => {
    const horizontal = segmentsWithSymmetricGaps(0, 100, [25, 75], 7);
    const vertical = segmentsWithSymmetricGaps(0, 100, [75, 25], 7);
    expect(horizontal).toEqual([[0, 18], [32, 68], [82, 100]]);
    expect(vertical).toEqual(horizontal);
    for (const crossing of [25, 75]) expect(horizontal.some(([start, end]) => start <= crossing && crossing <= end)).toBe(false);
  });
  it('clips gaps at the boundary and merges intersecting gaps', () => {
    expect(segmentsWithSymmetricGaps(0, 30, [2, 8, 28], 6)).toEqual([[14, 22]]);
  });
});
