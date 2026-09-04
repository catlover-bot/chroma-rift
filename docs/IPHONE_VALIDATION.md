# Physical iPhone validation protocol

This is a product usability experiment, not a medical test. Stop immediately if the participant experiences eye strain, discomfort, headache, dizziness, or any other unpleasant effect. Do not ask the participant to stare without blinking.

## Prepare

1. Install the current Expo Go from the App Store on the iPhone.
2. In the repository, use Node.js 24 and run `npm ci`.
3. Run `npx expo start`.
4. If WSL2 LAN access fails, stop Metro and run `npx expo start --tunnel`.
5. Open the displayed QR code in Expo Go.
6. Keep the iPhone in portrait orientation.
7. Begin at an ordinary, comfortable screen brightness; do not maximize brightness solely for the test.
8. Manually record iPhone model, iOS version, approximate brightness, True Tone state, Night Shift state, and approximate viewing distance. The app does not detect these settings.

## Calibration

1. From `CHROMA RIFT`, choose `見え方を調整する`.
2. Read the comfort and non-medical notices.
3. Complete all 12 trials once. Confirm every stimulus remains still until an answer is selected.
4. For red-front or blue-front answers, choose perceived strength. Confirm same/unclear answers skip strength.
5. Record the generated profile, decisive count, direction, mean strength, `一貫度`, dark-background direction, light-background direction, and reversal observation.
6. If useful, repeat the complete calibration once while paying particular attention to the alternate background condition. Do not cherry-pick individual answers or treat the profile as a diagnosis.

## Three-junction micro-maze

1. Choose `迷路を試す` and play the three sequential junctions.
2. At each junction, confirm the orb stops and input becomes available.
3. Tap directly on both central and edge portions of visible rails across runs. Confirm accepted taps align with the closest eligible rail and off-rail taps do nothing.
4. Confirm a valid selection locks further input until travel completes.
5. Confirm the result reports score, correct decisions out of 3, accuracy, best combo, calibration profile, and Depth Assist state.
6. Enable Depth Assist and verify its neutral symbol/line-width cue remains understandable without relying on red versus blue alone. Verify it does not reduce score.
7. Enable `動きを減らす`; verify orb transitions become brief and there are no decorative particles or scale pulses.
8. Send the app to the background during a stage, return, and confirm the paused overlay requires `再開する`.
9. If haptics is enabled, note whether a light selection feedback is felt; a missing vibration can be device-setting dependent.
10. Restart, exit, and replay safely. Confirm the best score persists.

## Report

Use `EXPERIMENT_LOG_TEMPLATE.md`. Record inability to perceive depth just as validly as strong perception. Record discomfort as none/mild/moderate/severe with notes. If any discomfort occurs, stop immediately; do not continue for comparison data. Do not record names, email addresses, contacts, device identifiers, advertising identifiers, locations, or account information.
