import { requireOptionalNativeModule } from 'expo';

/** expo-gl 57.0.2's GLView.tsx and ExpoGLModule.swift both register "ExpoGL". */
export function hasNative3D(): boolean {
  try {
    return requireOptionalNativeModule('ExpoGL') !== null;
  } catch {
    return false;
  }
}
