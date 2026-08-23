import type { Clock, Storage } from '../ports/index.ts';
import { emptySaveData } from '../model/index.ts';
import type { BodyweightEntry } from '../model/index.ts';
import { newId } from '../model/index.ts';

/**
 * Operations over the bodyweight log (the "Лог веса тела"; see CONTEXT.md).
 *
 * Each function reads the whole save through the {@link Storage} port, works on
 * {@link SaveData.bodyweightLog}, and writes it back — the core never touches `localStorage`
 * or `Date.now()` directly. Time comes from the injected {@link Clock}, so behaviour is
 * deterministic under a `FixedClock` in tests.
 *
 * The log is append-only: recording a measurement always creates a fresh entry (its own
 * {@link newId}); there is no dedup or edit-in-place. Multiple entries on the same day are
 * allowed (weighing more than once).
 */

/**
 * Record a bodyweight measurement with the current time from `clock`.
 *
 * @param weight measured bodyweight in kilograms; must be a finite number > 0.
 * @returns the newly created entry (already persisted).
 * @throws RangeError if `weight` is not a finite positive number.
 */
export function addBodyweightEntry(
  storage: Storage,
  clock: Clock,
  weight: number,
): BodyweightEntry {
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new RangeError(`bodyweight must be a finite positive number, got ${weight}`);
  }

  const save = storage.load() ?? emptySaveData();
  const entry: BodyweightEntry = {
    id: newId(),
    weight,
    date: clock.now(),
  };
  save.bodyweightLog.push(entry);
  storage.save(save);
  return entry;
}

/**
 * All bodyweight entries, oldest first (ascending by {@link BodyweightEntry.date}).
 * Returns a fresh array; mutating it does not affect the stored save.
 */
export function listBodyweight(storage: Storage): BodyweightEntry[] {
  const save = storage.load();
  if (save === null) return [];
  return [...save.bodyweightLog].sort((a, b) => a.date - b.date);
}

/**
 * Delete a bodyweight entry by id. No-op if the id is not present.
 * @returns `true` if an entry was removed, `false` otherwise.
 */
export function removeBodyweightEntry(storage: Storage, id: string): boolean {
  const save = storage.load();
  if (save === null) return false;

  const next = save.bodyweightLog.filter((e) => e.id !== id);
  if (next.length === save.bodyweightLog.length) return false;

  save.bodyweightLog = next;
  storage.save(save);
  return true;
}
