import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';

import { ActionButton, Body, ChoiceRow, Screen } from '../components/Layout';
import type {
  CalibrationAnswer,
  CalibrationResponse,
  CalibrationSession,
  PerceivedStrength,
} from '../domain/calibration/types';
import { CalibrationStimulus } from '../rendering/CalibrationStimulus';
import { UI_COLORS } from '../theme/ui';

export function CalibrationScreen({
  session,
  onResponse,
  onExit,
}: {
  session: CalibrationSession;
  onResponse: (response: CalibrationResponse) => void;
  onExit: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [pending, setPending] = useState<
    { trialId: string; answer: 'redFront' | 'blueFront' } | undefined
  >();
  const submitted = useRef(false);
  const index = session.responses.length;
  const trial = session.trials[index];

  useEffect(() => {
    submitted.current = false;
  }, [trial?.id]);

  if (!trial) return null;
  const pendingAnswer = pending?.trialId === trial.id ? pending.answer : undefined;

  const submit = (answer: CalibrationAnswer, strength?: PerceivedStrength) => {
    if (submitted.current || session.responses.some((response) => response.trialId === trial.id)) return;
    submitted.current = true;
    onResponse({
      schemaVersion: 1,
      // Record what was displayed, including when an older session is resumed.
      stimulusVersion: 2,
      trialId: trial.id,
      patternFamily: trial.patternFamily,
      background: trial.background,
      colorRoleAssignment: trial.colorRoleAssignment,
      answer,
      ...(strength ? { strength } : {}),
      respondedAt: new Date().toISOString(),
      sessionSeed: session.seed,
    });
  };

  const choose = (answer: CalibrationAnswer) => {
    if (answer === 'redFront' || answer === 'blueFront') setPending({ trialId: trial.id, answer });
    else submit(answer);
  };

  const stimulusWidth = Math.min(width - 40, 430);
  const stimulusHeight = Math.min(Math.max(height * 0.36, 260), 380);

  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.progress}>{index + 1} / 12</Text>
      <CalibrationStimulus trial={trial} width={stimulusWidth} height={stimulusHeight} />
      <Body>どちらが手前に見えますか？</Body>
      {pendingAnswer ? (
        <>
          <Body>{pendingAnswer === 'redFront' ? '赤' : '青'}の奥行き感はどのくらいですか？</Body>
          <ChoiceRow>
            {([1, 2, 3] as const).map((strength) => (
              <ActionButton
                key={strength}
                label={strength === 1 ? '弱い' : strength === 2 ? '普通' : '強い'}
                onPress={() => submit(pendingAnswer, strength)}
                testID={`strength-${strength}`}
              />
            ))}
          </ChoiceRow>
          <ActionButton label="回答を選び直す" onPress={() => setPending(undefined)} />
        </>
      ) : (
        <>
          <ChoiceRow>
            <ActionButton label="赤が手前" onPress={() => choose('redFront')} testID="answer-red" />
            <ActionButton label="青が手前" onPress={() => choose('blueFront')} testID="answer-blue" />
          </ChoiceRow>
          <ChoiceRow>
            <ActionButton label="同じくらい" onPress={() => choose('same')} testID="answer-same" />
            <ActionButton label="よく分からない" onPress={() => choose('unclear')} testID="answer-unclear" />
          </ChoiceRow>
        </>
      )}
      <ActionButton label="調整を中断する" onPress={onExit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { color: UI_COLORS.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
});
