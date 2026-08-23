import { describe, it, expect } from 'vitest';
import {
  FixedClock,
  InMemoryStorage,
  emptySaveData,
  addBodyweightEntry,
  listBodyweight,
  removeBodyweightEntry,
} from '../index.ts';

describe('addBodyweightEntry', () => {
  it('stamps the entry with the time from the injected Clock, not Date.now()', () => {
    const storage = new InMemoryStorage();
    const clock = new FixedClock(1_700_000_000_000);

    const entry = addBodyweightEntry(storage, clock, 82.5);

    expect(entry.date).toBe(1_700_000_000_000);
    expect(entry.weight).toBe(82.5);
    expect(entry.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('persists the entry through the Storage port', () => {
    const storage = new InMemoryStorage();
    const clock = new FixedClock(1_000);

    addBodyweightEntry(storage, clock, 80);

    const reloaded = storage.load();
    expect(reloaded?.bodyweightLog).toHaveLength(1);
    expect(reloaded?.bodyweightLog[0]).toMatchObject({ weight: 80, date: 1_000 });
  });

  it('seeds an empty save when nothing has been stored yet', () => {
    const storage = new InMemoryStorage();
    const clock = new FixedClock(5);

    expect(storage.load()).toBeNull();
    addBodyweightEntry(storage, clock, 75);

    expect(storage.load()?.bodyweightLog).toHaveLength(1);
  });

  it('appends and gives every measurement its own id (no dedup, same day allowed)', () => {
    const storage = new InMemoryStorage();
    const clock = new FixedClock(1_000);

    const a = addBodyweightEntry(storage, clock, 80);
    const b = addBodyweightEntry(storage, clock, 80); // same weight, same day

    expect(a.id).not.toBe(b.id);
    expect(storage.load()?.bodyweightLog).toHaveLength(2);
  });

  it('advances with the clock across measurements', () => {
    const storage = new InMemoryStorage();
    const clock = new FixedClock(1_000);

    const first = addBodyweightEntry(storage, clock, 81);
    clock.advance(86_400_000); // +1 day
    const second = addBodyweightEntry(storage, clock, 80.5);

    expect(first.date).toBe(1_000);
    expect(second.date).toBe(1_000 + 86_400_000);
  });

  it('rejects non-positive or non-finite weights', () => {
    const storage = new InMemoryStorage();
    const clock = new FixedClock(0);

    expect(() => addBodyweightEntry(storage, clock, 0)).toThrow(RangeError);
    expect(() => addBodyweightEntry(storage, clock, -5)).toThrow(RangeError);
    expect(() => addBodyweightEntry(storage, clock, Number.NaN)).toThrow(RangeError);
    expect(() => addBodyweightEntry(storage, clock, Infinity)).toThrow(RangeError);
    expect(storage.load()).toBeNull(); // nothing written on rejection
  });
});

describe('listBodyweight', () => {
  it('returns [] when there is no save', () => {
    expect(listBodyweight(new InMemoryStorage())).toEqual([]);
  });

  it('returns entries oldest-first regardless of insertion order', () => {
    const storage = new InMemoryStorage();
    const clock = new FixedClock(3_000);
    addBodyweightEntry(storage, clock, 80);
    clock.set(1_000);
    addBodyweightEntry(storage, clock, 79);
    clock.set(2_000);
    addBodyweightEntry(storage, clock, 78);

    expect(listBodyweight(storage).map((e) => e.date)).toEqual([1_000, 2_000, 3_000]);
  });

  it('returns a copy that does not alias stored data', () => {
    const storage = new InMemoryStorage(emptySaveData());
    const clock = new FixedClock(1_000);
    addBodyweightEntry(storage, clock, 80);

    const list = listBodyweight(storage);
    list.pop();

    expect(listBodyweight(storage)).toHaveLength(1);
  });
});

describe('removeBodyweightEntry', () => {
  it('removes an entry by id and persists the result', () => {
    const storage = new InMemoryStorage();
    const clock = new FixedClock(1_000);
    const a = addBodyweightEntry(storage, clock, 80);
    const b = addBodyweightEntry(storage, clock, 79);

    expect(removeBodyweightEntry(storage, a.id)).toBe(true);

    const remaining = listBodyweight(storage);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(b.id);
  });

  it('is a no-op for an unknown id or an empty save', () => {
    const storage = new InMemoryStorage();
    expect(removeBodyweightEntry(storage, 'nope')).toBe(false);

    const clock = new FixedClock(1_000);
    addBodyweightEntry(storage, clock, 80);
    expect(removeBodyweightEntry(storage, 'still-nope')).toBe(false);
    expect(listBodyweight(storage)).toHaveLength(1);
  });
});
