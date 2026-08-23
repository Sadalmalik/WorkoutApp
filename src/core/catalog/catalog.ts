/**
 * Exercise catalog operations.
 *
 * Two layers, both pure of DOM/React:
 * - Storage-backed CRUD (`createExercise`, `updateExercise`, `getExercise`, `listExercises`)
 *   that read/write the whole {@link SaveData} through the injected {@link Storage} port.
 * - Pure collection helpers (`searchExercises`, `collectZones`) over an `Exercise[]`, so the UI
 *   and tests can derive views without touching storage.
 *
 * Search is the load-bearing piece: the root cause of duplicate exercises in v1 was poor search.
 * It is case-insensitive substring matching over the name plus the zone (not fuzzy — Phase 2).
 */

import type { Storage } from '../ports/index.ts';
import type { Exercise, MuscleRef, SaveData } from '../model/index.ts';
import { newId, emptySaveData } from '../model/index.ts';

/** Default equipment weight step (kg) when a draft does not specify one. */
export const DEFAULT_WEIGHT_STEP = 2.5;

/**
 * Fields accepted when creating or updating an exercise. Everything except `name` is optional;
 * create fills defaults, update leaves omitted fields unchanged.
 */
export interface ExerciseDraft {
  name: string;
  zone?: string;
  videoLinks?: string[];
  isBodyweight?: boolean;
  equipmentWeightStep?: number;
  notes?: string;
  muscleRefs?: MuscleRef[];
}

/** Create a new exercise from `draft`, assign a fresh id, persist, and return it. */
export function createExercise(storage: Storage, draft: ExerciseDraft): Exercise {
  const save = loadSave(storage);
  const exercise = normalize(draft, newId());
  save.exercises = [...save.exercises, exercise];
  storage.save(save);
  return exercise;
}

/**
 * Apply `patch` to the exercise with `id`, persist, and return the updated exercise.
 * Only the fields present in `patch` change; the id is immutable. Throws if `id` is unknown.
 */
export function updateExercise(
  storage: Storage,
  id: string,
  patch: Partial<ExerciseDraft>,
): Exercise {
  const save = loadSave(storage);
  const index = save.exercises.findIndex((e) => e.id === id);
  if (index === -1) throw new Error(`Exercise not found: ${id}`);

  const updated = merge(save.exercises[index], patch);
  save.exercises = save.exercises.map((e, i) => (i === index ? updated : e));
  storage.save(save);
  return updated;
}

/** Look up a single exercise by id, or `undefined` if none matches. */
export function getExercise(storage: Storage, id: string): Exercise | undefined {
  return loadSave(storage).exercises.find((e) => e.id === id);
}

/** All exercises, sorted by name (case-insensitive). */
export function listExercises(storage: Storage): Exercise[] {
  return [...loadSave(storage).exercises].sort(byName);
}

/**
 * Filter `exercises` by `query`: case-insensitive substring match against name OR zone.
 * An empty/whitespace query returns every exercise. Results are sorted by name.
 */
export function searchExercises(exercises: Exercise[], query: string): Exercise[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...exercises].sort(byName);

  return exercises
    .filter((e) => e.name.toLowerCase().includes(q) || e.zone.toLowerCase().includes(q))
    .sort(byName);
}

/**
 * Distinct, non-empty zones across `exercises`, de-duplicated case-insensitively (first-seen
 * spelling wins) and sorted. Feeds the zone autocomplete in the editor.
 */
export function collectZones(exercises: Exercise[]): string[] {
  const seen = new Map<string, string>();
  for (const e of exercises) {
    const zone = e.zone.trim();
    if (zone === '') continue;
    const key = zone.toLowerCase();
    if (!seen.has(key)) seen.set(key, zone);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function loadSave(storage: Storage): SaveData {
  return storage.load() ?? emptySaveData();
}

function byName(a: Exercise, b: Exercise): number {
  return a.name.localeCompare(b.name);
}

/** Build a full exercise from a draft, trimming text and applying defaults. */
function normalize(draft: ExerciseDraft, id: string): Exercise {
  return {
    id,
    name: draft.name.trim(),
    zone: (draft.zone ?? '').trim(),
    videoLinks: cleanLinks(draft.videoLinks),
    isBodyweight: draft.isBodyweight ?? false,
    equipmentWeightStep: draft.equipmentWeightStep ?? DEFAULT_WEIGHT_STEP,
    notes: draft.notes ?? '',
    muscleRefs: draft.muscleRefs ?? [],
  };
}

/** Merge a partial patch onto an existing exercise, normalizing the fields it touches. */
function merge(current: Exercise, patch: Partial<ExerciseDraft>): Exercise {
  return {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.zone !== undefined ? { zone: patch.zone.trim() } : {}),
    ...(patch.videoLinks !== undefined ? { videoLinks: cleanLinks(patch.videoLinks) } : {}),
    ...(patch.isBodyweight !== undefined ? { isBodyweight: patch.isBodyweight } : {}),
    ...(patch.equipmentWeightStep !== undefined
      ? { equipmentWeightStep: patch.equipmentWeightStep }
      : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.muscleRefs !== undefined ? { muscleRefs: patch.muscleRefs } : {}),
  };
}

/** Trim links and drop empty ones. */
function cleanLinks(links: string[] | undefined): string[] {
  if (links === undefined) return [];
  return links.map((l) => l.trim()).filter((l) => l !== '');
}
