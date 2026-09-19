import Constants from 'expo-constants';
import appConfig from '../../app.json';

// A source marker, not a claim that a particular EAS binary was installed.
export const DIAGNOSTIC_REVISION = 'goal-015-sakushikan-r1';

export function buildIdentity() {
  const profileMarker = process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE;
  const nativeBuild = Constants.platform?.ios?.buildNumber;
  return {
    code: DIAGNOSTIC_REVISION,
    appVersion: Constants.expoConfig?.version ?? appConfig.expo.version,
    nativeBuild: nativeBuild == null ? 'unknown' : String(nativeBuild),
    profileMarker: profileMarker === 'preview' || profileMarker === 'development' || profileMarker === 'production' ? profileMarker : 'unknown',
    bundleSource: __DEV__ ? 'metro-development' : 'release-js',
  };
}

export function internalDiagnosticsEnabled(): boolean {
  return __DEV__ || process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE === 'preview';
}
