/**
 * Active-program operations and the Home state machine (ticket 04).
 *
 * These are the storage-backed verbs the UI (and, in ticket 05, the session layer) call to launch
 * a program, ask "what is Home showing right now", and drive the scheduler cursor. Each loads the
 * whole {@link SaveData} through the injected {@link Storage} port, mutates
 * {@link SaveData.activeProgram} / {@link SaveData.schedulerState}, and persists — the core never
 * touches the DOM (ARCH invariant #1).
 *
 * ## Integration point for the session (ticket 05)
 * The session screen reads {@link currentWorkout} to know what to run, and calls
 * {@link advanceSchedule} exactly once when the workout is finished (completing it moves the
 * scheduler cursor). {@link skipSchedule} is "пропустить / начать следующую". {@link deferCurrentBlock}
 * reorders blocks within the running workout. None of these require re-implementing the scheduler;
 * they are stable wrappers over the {@link Scheduler} interface.
 */

import type { Clock, Storage } from '../ports/index.ts';
import type { Program, Workout, SaveData, SchedulerState } from '../model/index.ts';
import type { SchedulerId } from './scheduler.ts';
import { emptySaveData } from '../model/index.ts';
import { getScheduler } from './registry.ts';
import { dayIndex } from './day.ts';

/**
 * What Home renders right now. A discriminated union so the UI switch is exhaustive:
 * - `no-program` — nothing active; offer "начать программу".
 * - `paused` — active but paused; offer "продолжить".
 * - `workout` — a workout is due; offer "начать" / "пропустить".
 * - `rest` — a rest day; offer "начать следующую" (pull-forward).
 * - `completed` — today's workout is done; offer "начать следующую".
 */
export type HomeStatus =
  | { kind: 'no-program' }
  | { kind: 'paused'; program: Program }
  | { kind: 'workout'; program: Program; workout: Workout }
  | { kind: 'rest'; program: Program }
  | { kind: 'completed'; program: Program };

function loadSave(storage: Storage): SaveData {
  return storage.load() ?? emptySaveData();
}

/** Resolve the active program record against the catalog, or `null` if none / dangling. */
function activeProgram(save: SaveData): { program: Program; schedulerId: SchedulerId; paused: boolean } | null {
  const active = save.activeProgram;
  if (active === null) return null;
  const program = save.programs.find((p) => p.id === active.programId);
  if (program === undefined) return null;
  return { program, schedulerId: active.schedulerId, paused: active.paused };
}

/**
 * Launch `programId` under `schedulerId` (default: the program's recommended one). Initialises the
 * scheduler state with today's date from `clock` and clears any paused flag. Throws if the program
 * is unknown.
 */
export function startProgram(
  storage: Storage,
  clock: Clock,
  programId: string,
  schedulerId?: SchedulerId,
): void {
  const save = loadSave(storage);
  const program = save.programs.find((p) => p.id === programId);
  if (program === undefined) throw new Error(`Program not found: ${programId}`);

  const chosen: SchedulerId = schedulerId ?? program.recommendedSchedulerId;
  const scheduler = getScheduler(chosen);

  save.activeProgram = { programId, schedulerId: chosen, paused: false };
  save.schedulerState = scheduler.init(clock) as SchedulerState;
  storage.save(save);
}

/** The current Home state (pure over an already-loaded save; see {@link getHomeState}). */
export function homeState(save: SaveData, clock: Clock): HomeStatus {
  const active = activeProgram(save);
  if (active === null) return { kind: 'no-program' };
  if (active.paused) return { kind: 'paused', program: active.program };

  const scheduler = getScheduler(active.schedulerId);
  const state = save.schedulerState ?? {};
  const workout = scheduler.currentWorkout(state, active.program, clock);
  if (workout !== null) return { kind: 'workout', program: active.program, workout };

  // A null workout is either a rest day or a workout already finished today.
  const completedToday = state.completedDay === dayIndex(clock.now());
  return completedToday
    ? { kind: 'completed', program: active.program }
    : { kind: 'rest', program: active.program };
}

/** Storage-backed {@link homeState}: load the save and compute the Home state. */
export function getHomeState(storage: Storage, clock: Clock): HomeStatus {
  return homeState(loadSave(storage), clock);
}

/** The workout due now, or `null` for a rest day / a program that is inactive or paused. */
export function currentWorkout(storage: Storage, clock: Clock): Workout | null {
  const save = loadSave(storage);
  const active = activeProgram(save);
  if (active === null || active.paused) return null;
  return getScheduler(active.schedulerId).currentWorkout(save.schedulerState ?? {}, active.program, clock);
}

/**
 * Advance the scheduler after the current workout is completed (ticket 05 calls this once on
 * finish). No-op when no program is active.
 */
export function advanceSchedule(storage: Storage, clock: Clock): void {
  mutateState(storage, (scheduler, state, program) => scheduler.advance(state, program, clock));
}

/** Skip the current workout / pull the next one forward ("пропустить" / "начать следующую"). */
export function skipSchedule(storage: Storage, clock: Clock): void {
  mutateState(storage, (scheduler, state, program) => scheduler.skip(state, program, clock));
}

/**
 * Defer a block within the running workout (swap it with the next). Seeds the block order from the
 * live workout on first use so the swap has something to reorder (see `block-order.ts`). No-op when
 * there is no active workout.
 */
export function deferCurrentBlock(storage: Storage, clock: Clock, blockId: string): void {
  const save = loadSave(storage);
  const active = activeProgram(save);
  if (active === null || active.paused) return;

  const scheduler = getScheduler(active.schedulerId);
  let state = save.schedulerState ?? {};
  const workout = scheduler.currentWorkout(state, active.program, clock);
  if (workout === null) return;

  // Establish the order from the current workout the first time a block is deferred.
  if (!Array.isArray(state.blockOrder) || state.blockOrder === null) {
    state = { ...state, blockOrder: workout.blocks.map((b) => b.id) };
  }
  save.schedulerState = scheduler.deferBlock(state, blockId) as SchedulerState;
  storage.save(save);
}

/** Pause the active program (freezes the cursor; Home shows "на паузе"). No-op if none active. */
export function pauseProgram(storage: Storage): void {
  setPaused(storage, true);
}

/** Resume a paused program. No-op if none active. */
export function resumeProgram(storage: Storage): void {
  setPaused(storage, false);
}

/** Cancel the active program: clears the binding and scheduler state (Home → "начать программу"). */
export function cancelProgram(storage: Storage): void {
  const save = loadSave(storage);
  if (save.activeProgram === null) return;
  save.activeProgram = null;
  save.schedulerState = null;
  storage.save(save);
}

/**
 * Switch the active program to a different scheduler. Re-initialises the scheduler state with a
 * fresh start date from `clock` (ADR 0001: switching schedulers resets the private cursor state).
 * No-op if no program is active.
 */
export function changeScheduler(storage: Storage, clock: Clock, schedulerId: SchedulerId): void {
  const save = loadSave(storage);
  if (save.activeProgram === null) return;

  const scheduler = getScheduler(schedulerId);
  save.activeProgram = { ...save.activeProgram, schedulerId };
  save.schedulerState = scheduler.init(clock) as SchedulerState;
  storage.save(save);
}

function setPaused(storage: Storage, paused: boolean): void {
  const save = loadSave(storage);
  if (save.activeProgram === null) return;
  save.activeProgram = { ...save.activeProgram, paused };
  storage.save(save);
}

function mutateState(
  storage: Storage,
  step: (scheduler: ReturnType<typeof getScheduler>, state: SchedulerState, program: Program) => SchedulerState,
): void {
  const save = loadSave(storage);
  const active = activeProgram(save);
  if (active === null || active.paused) return;

  const scheduler = getScheduler(active.schedulerId);
  save.schedulerState = step(scheduler, save.schedulerState ?? {}, active.program) as SchedulerState;
  storage.save(save);
}
