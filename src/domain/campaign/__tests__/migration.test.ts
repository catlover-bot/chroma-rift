import { createGalleryRuntime } from '../../gallery/runtime';
import { createGalleryCheckpoint } from '../../gallery/checkpoint';
import { createVaultRuntime } from '../../vault/runtime';
import { createVaultCheckpoint } from '../../vault/checkpoint';
import { originalV1 } from '../../../storage/testFixtures/galleryV1';
import { vaultCheckpoint } from '../../../storage/testFixtures/vault';
import { theatreCheckpoint } from '../../../storage/testFixtures/theatre';
import { proposeLegacyCampaignImport } from '../migration';

test('an actual historical gallery clearance imports only the contiguous prefix', () => {
  const proposal = proposeLegacyCampaignImport({gallery:JSON.stringify(originalV1('cleared')),vault:null,theatre:null},'legacy-run','0.1.0');
  expect(proposal.status).toBe('ready');
  if (proposal.status !== 'ready') return;
  expect(proposal.completedPrefix).toBe(1);
  expect(proposal.session.currentArea).toBe('chapter-1-area-02');
  expect(proposal.session.completedAreas).toEqual(['chapter-1-area-01']);
  expect(proposal.session.storyFired).toEqual([]);
  expect(proposal.session.storyPresented).toEqual([]);
  expect(proposal.session.campaignCompleted).toBe(false);
});

test('out-of-order vault record never completes an unplayed gallery', () => {
  const vault = createVaultCheckpoint(createVaultRuntime());
  const proposal = proposeLegacyCampaignImport({gallery:null,vault:JSON.stringify(vault),theatre:null},'legacy-run','0.1.0');
  expect(proposal.status).toBe('ready');
  if (proposal.status !== 'ready') return;
  expect(proposal.completedPrefix).toBe(0);
  expect(proposal.session.currentArea).toBe('chapter-1-area-01');
  expect(proposal.session.completedAreas).toEqual([]);
});

test('three cleared old stages enter area 04 without claiming a key or a new observation', () => {
  const proposal = proposeLegacyCampaignImport({gallery:JSON.stringify(originalV1('cleared')),
    vault:JSON.stringify(vaultCheckpoint('clear')),theatre:JSON.stringify(theatreCheckpoint('completed'))},'legacy-run','0.1.0');
  expect(proposal.status).toBe('ready');
  if (proposal.status !== 'ready') return;
  expect(proposal.completedPrefix).toBe(3);
  expect(proposal.session).toMatchObject({ currentArea: 'chapter-1-area-04',
    completedAreas: ['chapter-1-area-01', 'chapter-1-area-02', 'chapter-1-area-03'],
    keyLocation: 'unfound', storyFired: [], storyPresented: [], campaignCompleted: false });
});

test('unknown or damaged old raw is blocked, never treated as empty progress', () => {
  const gallery = createGalleryCheckpoint(createGalleryRuntime());
  const unknown = { ...gallery, levelVersion: 999 };
  expect(proposeLegacyCampaignImport({gallery:JSON.stringify(unknown),vault:null,theatre:null},'run','0.1.0')).toEqual({status:'blocked',source:'gallery'});
  expect(proposeLegacyCampaignImport({gallery:'{broken',vault:null,theatre:null},'run','0.1.0')).toEqual({status:'blocked',source:'gallery'});
  expect(proposeLegacyCampaignImport({gallery:null,vault:null,theatre:null},'run','0.1.0')).toEqual({status:'none'});
});
