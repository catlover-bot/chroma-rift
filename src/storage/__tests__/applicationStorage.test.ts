import { createDefaultApplication, parsePersistedApplication } from '../applicationStorage';

describe('persisted application parsing', () => {
  it('falls back safely for malformed JSON', () => {
    expect(parsePersistedApplication('{broken')).toEqual(createDefaultApplication(false));
  });

  it('falls back safely for unsupported schema versions', () => {
    expect(parsePersistedApplication(JSON.stringify({ schemaVersion: 99 }))).toEqual(
      createDefaultApplication(false),
    );
  });

  it('honors the initial OS reduced-motion preference', () => {
    expect(parsePersistedApplication(null, true).settings.reducedMotion).toBe(true);
  });
});
