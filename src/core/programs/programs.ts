/**
 * Program operations.
 *
 * Two layers, both pure of DOM/React (see ARCH invariant #1):
 * - Pure builders (`newProgram`, `newPlan`, `newWorkout`, `newBlock`, `newBlockExercise`,
 *   `newRestDay`, `newWorkoutDay`) that construct valid-by-default structures with fresh ids,
 *   and a pure `validateProgram` that reports structural/reference problems.
 * - Storage-backed CRUD (`createProgram`, `updateProgram`, `getProgram`, `listPrograms`,
 *   `deleteProgram`) that read/write the whole {@link SaveData} through the injected
 *   {@link Storage} port and enforce validation (including referential integrity against the
 *   exercise catalog) before persisting.
 *
 * Terms follow CONTEXT.md: Программа → План → День (отдыха|Тренировка) → Блок → BlockExercise.
 * Phase 1 targets are static ({weight, reps}); progression grids are Phase 2 (ADR 0003).
 */

import type { Storage } from '../ports/index.ts';
import type {
  Program,
  Plan,
  PlanDay,
  Workout,
  Block,
  BlockExercise,
  StaticTarget,
  SaveData,
} from '../model/index.ts';
import type { SchedulerId } from '../scheduler/scheduler.ts';
import { newId, emptySaveData } from '../model/index.ts';

/** Default recommended scheduler for a freshly created program. */
export const DEFAULT_SCHEDULER_ID: SchedulerId = 'calendar';

/** Convenience defaults for freshly built blocks/workouts (all satisfy `validateProgram`). */
export const BLOCK_DEFAULTS = {
  sets: 3,
  betweenSetsRest: 90,
  betweenSupersetExercisesRest: 15,
} as const;

/** Default rest between blocks (`междуБлоками`), seconds, for a freshly built workout. */
export const DEFAULT_BETWEEN_BLOCKS_REST = 120;

/** Default per-set target for a freshly added exercise slot. */
export const DEFAULT_TARGET: StaticTarget = { weight: 0, reps: 8 };


/** Build a fresh exercise slot referencing `exerciseId`, with a fresh stable slot id. */
export function newBlockExercise(exerciseId: string, target: StaticTarget = DEFAULT_TARGET): BlockExercise {
  return { id: newId(), exerciseId, target: { ...target } };
}

/** Build a fresh block from the given exercise slots (>= 1 to be valid), applying rest defaults. */
export function newBlock(exercises: BlockExercise[] = []): Block {
  return {
    id: newId(),
    exercises,
    sets: BLOCK_DEFAULTS.sets,
    betweenSetsRest: BLOCK_DEFAULTS.betweenSetsRest,
    betweenSupersetExercisesRest: BLOCK_DEFAULTS.betweenSupersetExercisesRest,
  };
}

/** Build a fresh, empty workout (no blocks yet) with the default between-blocks rest. */
export function newWorkout(blocks: Block[] = []): Workout {
  return { id: newId(), blocks, betweenBlocksRest: DEFAULT_BETWEEN_BLOCKS_REST };
}

/** A rest day. */
export function newRestDay(): PlanDay {
  return { kind: 'rest' };
}

/** A training day carrying `workout` (a fresh empty workout by default). */
export function newWorkoutDay(workout: Workout = newWorkout()): PlanDay {
  return { kind: 'workout', workout };
}

/** Build a fresh plan of `length` days; every day is a rest day by default (`length` >= 1). */
export function newPlan(length: number): Plan {
  const days: PlanDay[] = [];
  for (let i = 0; i < Math.max(1, Math.floor(length)); i++) days.push(newRestDay());
  return { id: newId(), days };
}

/**
 * Build a fresh program named `name` with a single plan of `planLength` rest days (Phase 1 has
 * exactly one plan). `recommendedSchedulerId` defaults to {@link DEFAULT_SCHEDULER_ID}.
 */
export function newProgram(
  name: string,
  opts: { planLength?: number; recommendedSchedulerId?: SchedulerId } = {},
): Program {
  return {
    id: newId(),
    name: name.trim(),
    plans: [newPlan(opts.planLength ?? 1)],
    recommendedSchedulerId: opts.recommendedSchedulerId ?? DEFAULT_SCHEDULER_ID,
  };
}



/**
 * Structurally validate `program`, returning a list of human-readable error messages (empty =
 * valid). Rules (see acceptance criteria):
 * - name is non-empty (after trim);
 * - at least one plan; each plan has at least one day;
 * - each training day's workout has >= 1 block and `betweenBlocksRest` >= 0;
 * - each block has >= 1 exercise, `sets` >= 1, and both rest intervals >= 0;
 * - each exercise slot has a non-empty `exerciseId`, `target.weight` >= 0, `target.reps` >= 1;
 * - every {@link BlockExercise.id} is unique across the whole program (stable re-link ids).
 *
 * When `knownExerciseIds` is supplied, every `exerciseId` must be a member (referential
 * integrity against the catalog).
 */
export function validateProgram(program: Program, knownExerciseIds?: Iterable<string>): string[] {
  const errors: string[] = [];
  const known = knownExerciseIds ? new Set(knownExerciseIds) : null;
  const seenSlotIds = new Set<string>();

  if (program.name.trim() === '') errors.push('Название программы не может быть пустым.');
  if (program.plans.length === 0) errors.push('Программа должна содержать хотя бы один план.');

  program.plans.forEach((plan, pi) => {
    if (plan.days.length === 0) errors.push(`План ${pi + 1}: длина плана должна быть не меньше одного дня.`);

    plan.days.forEach((day, di) => {
      if (day.kind !== 'workout') return;
      const where = `План ${pi + 1}, день ${di + 1}`;
      const workout = day.workout;

      if (workout.blocks.length === 0) errors.push(`${where}: тренировка должна содержать хотя бы один блок.`);
      if (!isNonNegative(workout.betweenBlocksRest)) errors.push(`${where}: интервал междуБлоками должен быть не меньше 0.`);

      workout.blocks.forEach((block, bi) => {
        const bWhere = `${where}, блок ${bi + 1}`;
        if (block.exercises.length === 0) errors.push(`${bWhere}: блок должен содержать хотя бы одно упражнение.`);
        if (!isPositiveInt(block.sets)) errors.push(`${bWhere}: число сетов должно быть целым не меньше 1.`);
        if (!isNonNegative(block.betweenSetsRest)) errors.push(`${bWhere}: интервал междуСетами должен быть не меньше 0.`);
        if (!isNonNegative(block.betweenSupersetExercisesRest)) errors.push(`${bWhere}: интервал междуУпражнениямиСуперсета должен быть не меньше 0.`);

        block.exercises.forEach((slot, si) => {
          const sWhere = `${bWhere}, упражнение ${si + 1}`;
          if (seenSlotIds.has(slot.id)) errors.push(`${sWhere}: дублирующийся BlockExercise.id (${slot.id}).`);
          seenSlotIds.add(slot.id);

          if (slot.exerciseId.trim() === '') errors.push(`${sWhere}: не задана ссылка на упражнение (exerciseId).`);
          else if (known && !known.has(slot.exerciseId)) errors.push(`${sWhere}: exerciseId ${slot.exerciseId} отсутствует в каталоге.`);

          if (!isNonNegative(slot.target.weight)) errors.push(`${sWhere}: целевой вес должен быть не меньше 0.`);
          if (!isPositiveInt(slot.target.reps)) errors.push(`${sWhere}: целевые повторы должны быть целым не меньше 1.`);
        });
      });
    });
  });

  return errors;
}

function isNonNegative(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n >= 1;
}



/** Create `program` (must have a fresh id not already present), validate, persist, and return it. */
export function createProgram(storage: Storage, program: Program): Program {
  const save = loadSave(storage);
  if (save.programs.some((p) => p.id === program.id)) {
    throw new Error(`Program already exists: ${program.id}`);
  }
  assertValid(program, save);
  save.programs = [...save.programs, program];
  storage.save(save);
  return program;
}

/** Replace the stored program with `program.id` by `program`, validate, persist, and return it. */
export function updateProgram(storage: Storage, program: Program): Program {
  const save = loadSave(storage);
  const index = save.programs.findIndex((p) => p.id === program.id);
  if (index === -1) throw new Error(`Program not found: ${program.id}`);
  assertValid(program, save);
  save.programs = save.programs.map((p, i) => (i === index ? program : p));
  storage.save(save);
  return program;
}

/** Look up a single program by id, or `undefined` if none matches. */
export function getProgram(storage: Storage, id: string): Program | undefined {
  return loadSave(storage).programs.find((p) => p.id === id);
}

/** All programs, sorted by name (case-insensitive). */
export function listPrograms(storage: Storage): Program[] {
  return [...loadSave(storage).programs].sort((a, b) => a.name.localeCompare(b.name));
}

/** Remove the program with `id` (no-op if absent) and persist. */
export function deleteProgram(storage: Storage, id: string): void {
  const save = loadSave(storage);
  const next = save.programs.filter((p) => p.id !== id);
  if (next.length === save.programs.length) return;
  save.programs = next;
  storage.save(save);
}

function assertValid(program: Program, save: SaveData): void {
  const errors = validateProgram(program, save.exercises.map((e) => e.id));
  if (errors.length > 0) throw new Error(`Invalid program:\n${errors.join('\n')}`);
}

function loadSave(storage: Storage): SaveData {
  return storage.load() ?? emptySaveData();
}

