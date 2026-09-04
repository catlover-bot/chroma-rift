import type {
  BackgroundMetrics,
  CalibrationProfile,
  CalibrationResponse,
  DepthPreference,
  StimulusBackground,
} from './types';

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function backgroundMetrics(
  responses: readonly CalibrationResponse[],
  background: StimulusBackground,
): BackgroundMetrics {
  const matching = responses.filter((response) => response.background === background);
  const redWeight = matching.reduce(
    (total, response) => total + (response.answer === 'redFront' ? (response.strength ?? 0) : 0),
    0,
  );
  const blueWeight = matching.reduce(
    (total, response) => total + (response.answer === 'blueFront' ? (response.strength ?? 0) : 0),
    0,
  );
  const decisiveCount = matching.filter(
    (response) => response.answer === 'redFront' || response.answer === 'blueFront',
  ).length;
  const totalWeight = redWeight + blueWeight;

  return {
    decisiveCount,
    direction: totalWeight === 0 ? 0 : (redWeight - blueWeight) / totalWeight,
  };
}

function classify(
  decisiveCount: number,
  meanDecisiveStrength: number,
  direction: number,
): DepthPreference {
  if (decisiveCount < 6 || meanDecisiveStrength < 1.5) return 'SOFT_DEPTH';
  if (direction >= 0.45) return 'RED_FRONT';
  if (direction <= -0.45) return 'BLUE_FRONT';
  return 'VARIABLE';
}

export function calculateCalibrationProfile(
  responses: readonly CalibrationResponse[],
  expectedTotalTrials = responses.length,
): CalibrationProfile {
  const decisive = responses.filter(
    (response) => response.answer === 'redFront' || response.answer === 'blueFront',
  );
  const redWeight = decisive.reduce(
    (total, response) => total + (response.answer === 'redFront' ? (response.strength ?? 0) : 0),
    0,
  );
  const blueWeight = decisive.reduce(
    (total, response) => total + (response.answer === 'blueFront' ? (response.strength ?? 0) : 0),
    0,
  );
  const decisiveCount = decisive.length;
  const decisiveRate = expectedTotalTrials === 0 ? 0 : decisiveCount / expectedTotalTrials;
  const totalWeight = redWeight + blueWeight;
  const meanDecisiveStrength = decisiveCount === 0 ? 0 : totalWeight / decisiveCount;
  const direction = totalWeight === 0 ? 0 : (redWeight - blueWeight) / totalWeight;
  const confidence = clamp(
    decisiveRate * Math.abs(direction) * Math.min(1, meanDecisiveStrength / 3),
    0,
    1,
  );
  const dark = backgroundMetrics(responses, 'dark');
  const light = backgroundMetrics(responses, 'light');
  const backgroundReversalObserved =
    dark.decisiveCount >= 2 &&
    light.decisiveCount >= 2 &&
    Math.sign(dark.direction) !== Math.sign(light.direction) &&
    Math.abs(dark.direction) >= 0.45 &&
    Math.abs(light.direction) >= 0.45;
  const preference = classify(decisiveCount, meanDecisiveStrength, direction);

  return {
    schemaVersion: 1,
    preference,
    preferredForegroundColor:
      preference === 'RED_FRONT' ? 'red' : preference === 'BLUE_FRONT' ? 'blue' : 'neutral',
    depthAssistDefault: preference === 'VARIABLE' || preference === 'SOFT_DEPTH',
    totalTrials: expectedTotalTrials,
    decisiveCount,
    unclearCount: responses.filter((response) => response.answer === 'unclear').length,
    sameCount: responses.filter((response) => response.answer === 'same').length,
    redWeight,
    blueWeight,
    decisiveRate,
    meanDecisiveStrength,
    direction,
    confidence,
    dark,
    light,
    backgroundReversalObserved,
  };
}

export const PROFILE_EXPLANATIONS: Record<DepthPreference, string> = {
  RED_FRONT: '赤が手前に見える回答が一貫していました。赤を主な前景ルートにします。',
  BLUE_FRONT: '青が手前に見える回答が一貫していました。青を主な前景ルートにします。',
  VARIABLE: '色や背景によって見え方が変わりました。補助記号を標準で表示します。',
  SOFT_DEPTH: '奥行きの手がかりが穏やかでした。補助記号を標準で表示します。',
};

export const PROFILE_LABELS: Record<DepthPreference, string> = {
  RED_FRONT: '赤が手前（RED_FRONT）',
  BLUE_FRONT: '青が手前（BLUE_FRONT）',
  VARIABLE: '見え方が変化（VARIABLE）',
  SOFT_DEPTH: '穏やかな奥行き（SOFT_DEPTH）',
};
