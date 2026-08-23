import { describe, it, expect } from 'vitest';
import { InMemoryStorage, emptySaveData, DEFAULT_SETTINGS, updateSettings } from '../index.ts';

describe('updateSettings', () => {
  it('merges a partial patch, leaving unspecified fields untouched', () => {
    const storage = new InMemoryStorage();

    const settings = updateSettings(storage, { theme: 'dark' });

    expect(settings.theme).toBe('dark');
    expect(settings.colorblindPalette).toBe(DEFAULT_SETTINGS.colorblindPalette);
    expect(settings.continueThresholdHours).toBe(DEFAULT_SETTINGS.continueThresholdHours);
  });

  it('persists the change through the Storage port', () => {
    const storage = new InMemoryStorage();

    updateSettings(storage, { colorblindPalette: 'deuteranopia' });

    expect(storage.load()?.settings.colorblindPalette).toBe('deuteranopia');
  });

  it('applies successive patches independently (theme then palette)', () => {
    const storage = new InMemoryStorage();

    updateSettings(storage, { theme: 'light' });
    const after = updateSettings(storage, { colorblindPalette: 'protanopia' });

    expect(after.theme).toBe('light');
    expect(after.colorblindPalette).toBe('protanopia');
  });

  it('clears the palette back to the default (null)', () => {
    const storage = new InMemoryStorage();
    updateSettings(storage, { colorblindPalette: 'tritanopia' });

    const cleared = updateSettings(storage, { colorblindPalette: null });

    expect(cleared.colorblindPalette).toBeNull();
    expect(storage.load()?.settings.colorblindPalette).toBeNull();
  });

  it('seeds an empty save when nothing has been stored yet', () => {
    const storage = new InMemoryStorage();
    expect(storage.load()).toBeNull();

    updateSettings(storage, { theme: 'dark' });

    const loaded = storage.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.settings.theme).toBe('dark');
    // The rest of the save is a well-formed empty save.
    expect(loaded?.schemaVersion).toBe(emptySaveData().schemaVersion);
    expect(loaded?.exercises).toEqual([]);
  });

  it('preserves other save sections when writing settings', () => {
    const storage = new InMemoryStorage();
    const seed = emptySaveData();
    seed.muscles = [{ id: 'm1', name: 'Грудь' }];
    storage.save(seed);

    updateSettings(storage, { theme: 'dark' });

    expect(storage.load()?.muscles).toEqual([{ id: 'm1', name: 'Грудь' }]);
  });
});
