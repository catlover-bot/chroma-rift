import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LegacyCampaignRaw } from '../domain/campaign/migration';
import { GALLERY_CHECKPOINT_KEY, GALLERY_V1_CHECKPOINT_KEY, GALLERY_V2_CHECKPOINT_KEY,
  THEATRE_CHECKPOINT_KEY, VAULT_CHECKPOINT_KEY } from './firstPersonStorage';

/** Read-only candidate collection. Current standalone migration may have
 * written v3 already; older gallery bytes remain untouched for recovery. */
export async function loadLegacyCampaignRaw(): Promise<LegacyCampaignRaw> {
  const [galleryV3, galleryV2, galleryV1, vault, theatre] = await Promise.all([
    AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY), AsyncStorage.getItem(GALLERY_V2_CHECKPOINT_KEY),
    AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY), AsyncStorage.getItem(VAULT_CHECKPOINT_KEY),
    AsyncStorage.getItem(THEATRE_CHECKPOINT_KEY),
  ]);
  return { gallery: galleryV3 ?? galleryV2 ?? galleryV1, vault, theatre };
}
