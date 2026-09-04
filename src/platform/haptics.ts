import * as Haptics from 'expo-haptics';

export async function playSelectionHaptic(enabled: boolean): Promise<void> {
  if (!enabled) return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // Haptics can be unavailable in low-power mode or on unsupported hardware.
  }
}
