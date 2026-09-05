# Physical iPhone validation protocol

This is a product usability experiment, not a medical test. Stop immediately if the participant experiences eye strain, discomfort, headache, dizziness, or any other unpleasant effect. Do not ask the participant to stare without blinking.

## Required development-build setup

Do not begin this protocol in ordinary App Store Expo Go. This Expo SDK 57 project must first be installed as its own signed iOS development build by following `EAS_IOS_DEVELOPMENT_BUILD.md`.

Before collecting any observations, confirm:

1. The target iPhone was registered for the internal-distribution build.
2. The project-specific EAS development build is installed on that registered iPhone.
3. Developer Mode is enabled on the iPhone if iOS requires it.
4. CHROMA RIFT launches from its own home-screen icon and opens the development-client launcher.
5. In the repository, Node.js 24 is active and `npm ci` has completed.
6. `npm run start:dev-client` starts Metro for the development client.
7. The installed development-client launcher connects to Metro over the normal LAN path. A displayed Metro QR code must be opened by this client, not ordinary Expo Go.
8. If WSL2 LAN discovery fails, stop Metro and run `npm run start:dev-client:tunnel`; confirm the client connects through the tunnel.
9. The welcome screen appears and Skia graphics render as intended rather than showing a blank or black-only canvas.
10. The developer laboratory appears in this development build.
11. No camera, microphone, location, tracking, contacts, photos, or notification permission prompt appears.
12. Apart from the development-client connection to Metro, no network-backed application feature is needed to calibrate, play, store a score, or open settings.

The EAS build, installation, device registration, Developer Mode, Skia rendering, haptics, and physical safe areas have not been verified by the repository-preparation process; record their actual result here.

## Display preparation

1. Keep the iPhone in portrait orientation.
2. Begin at an ordinary, comfortable screen brightness; do not maximize brightness solely for the test.
3. Manually record iPhone model, iOS version, approximate brightness, True Tone state, Night Shift state, and approximate viewing distance. The app does not detect these settings.
4. Confirm text and controls remain inside the physical safe area and no horizontal clipping is visible.

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
8. Send the app to the background during a stage, return, and confirm the paused overlay requires `再開する` before movement or input resumes.
9. Enable haptics and confirm valid rail selection produces only the intended light feedback. Disable haptics, select another valid route, and confirm no application haptic occurs. Note that device settings can suppress expected feedback.
10. Restart, exit, and replay safely. Confirm the best score persists.

## Development and production guards

1. In the installed development build, confirm `開発者ラボ` is reachable and its calibration-neutral/game-presentation controls work.
2. Run `npm run export:ios` in WSL2 and confirm it completes. Source and production-bundle review must confirm the `developerLab` entry is guarded by `__DEV__`; a final production app must not expose it.
3. Do not interpret the successful export as an installed production build or a physical-perception result.
4. Record whether pause/resume, permission behavior, Metro reconnection, and offline local storage match the expectations above.

## Report

Use `EXPERIMENT_LOG_TEMPLATE.md`. Record inability to perceive depth just as validly as strong perception. Record discomfort as none/mild/moderate/severe with notes. If any discomfort occurs, stop immediately; do not continue for comparison data. Do not record names, email addresses, contacts, device identifiers, advertising identifiers, locations, or account information.
