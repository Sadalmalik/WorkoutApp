import { describe, it, expect } from 'vitest';
import {
  FixedClock,
  InMemoryStorage,
  emptySaveData,
  SCHEMA_VERSION,
  type SaveData,
} from './index.ts';

describe('FixedClock', () => {
  it('returns the time it was given and only moves when told', () => {
    const clock = new FixedClock(1_000);
    expect(clock.now()).toBe(1_000);

    clock.advance(500);
    expect(clock.now()).toBe(1_500);

    clock.set(42);
    expect(clock.now()).toBe(42);
  });
});

describe('InMemoryStorage', () => {
  it('returns null before anything is saved', () => {
    const storage = new InMemoryStorage();
    expect(storage.load()).toBeNull();
  });

  it('round-trips a SaveData value', () => {
    const storage = new InMemoryStorage();
    const data = emptySaveData();

    storage.save(data);
    const loaded = storage.load();

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(data);
    expect(loaded?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('does not alias stored data by reference', () => {
    const storage = new InMemoryStorage();
    const data = emptySaveData();
    storage.save(data);

    // Mutating the original object must not affect what was stored.
    data.settings.theme = 'dark';
    const loaded = storage.load() as SaveData;

    expect(loaded.settings.theme).toBe('system');
  });

  it('accepts an initial value via the constructor', () => {
    const data = emptySaveData();
    const storage = new InMemoryStorage(data);
    expect(storage.load()).toEqual(data);
  });
});

describe('emptySaveData', () => {
  it('creates an empty save at the current schema version with all sections present', () => {
    const data = emptySaveData();

    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.exercises).toEqual([]);
    expect(data.muscles).toEqual([]);
    expect(data.programs).toEqual([]);
    expect(data.activeProgram).toBeNull();
    expect(data.schedulerState).toBeNull();
    expect(data.results).toEqual([]);
    expect(data.bodyweightLog).toEqual([]);
    expect(data.session).toBeNull();
    expect(data.settings.theme).toBe('system');
  });
});
