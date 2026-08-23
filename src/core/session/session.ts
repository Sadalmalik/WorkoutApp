/**
 * Session engine (ticket 05) — the end-to-end run of a workout, orthogonal to the scheduler.
 *
 * A {@link Session} is the current unfinished workout: it snapshots the due {@link Workout} so it
 * survives reload and a calendar-day change even when the scheduler would resolve a different
 * "today" (ADR 0001). Everything here is a pure function over the injected {@link Clock} /
 * {@link Storage} ports — no DOM, no `localStorage` (ARCH invariant #1).
 *
 * ## Lifecycle
 * `startSession` snapshots {@link currentWorkout} into `save.session`. `logSet` records the set at
 * the cursor (into both the session and the {@link Result} history) and advances the cursor;
 * finishing the last block auto-completes the session, which moves the scheduler cursor exactly
 * once via {@link advanceSchedule} and returns a {@link SessionSummary}. `abandonSession` closes a
 * stale session without advancing (the "завершить" branch of the continue/finish prompt).
 *
 * ## Ad-hoc (off-plan)
 * `startAdHoc` marks an off-plan exercise active on the session; while it is active `logSet` writes
 * to history only and never moves the plan cursor, and `timelinePaused` is set for the timeline
 * (ticket 07). Ad-hoc started with no active session does not create one — the UI uses
 * {@link logAdHocResult} to write history directly.
 *
 * ## Continue / finish prompt
 * {@link needsResumeDecision} is the pure "should we ask продолжить/завершить" predicate: true on a
 * calendar-day change since the last set, or after more than N hours (from settings) without one.
 */

import type { Clock, Storage } from '../ports/index.ts';
import type {
  SaveData,
  Session,
  SessionCursor,
  SessionSet,
  Result,
  Workout,
  Block,
  Exercise,
  StaticTarget,
} from '../model/index.ts';
import { emptySaveData, newId } from '../model/index.ts';
import { applyBlockOrder } from '../scheduler/block-order.ts';
import { deferInOrder } from '../scheduler/block-order.ts';
import { dayIndex } from '../scheduler/day.ts';
import { currentWorkout, advanceSchedule } from '../scheduler/active.ts';

const HOUR_MS = 3_600_000;

/**
 * End-of-workout summary handed to the result screen (ticket 09 enriches it with records/charts).
 * Deliberately minimal: identity, timing, the sets performed, and the two aggregates the basic
 * result screen shows.
 */
export interface SessionSummary {
  sessionId: string;
  programId: string;
  startedAt: number;
  finishedAt: number;
  sets: SessionSet[];
  /** Σ weight × reps over {@link sets}. */
  totalVolume: number;
  /** Number of sets logged. */
  setCount: number;
}

/**
 * The exercise the workout screen is pointed at right now: the cursor's planned slot, or the
 * active ad-hoc exercise. `null` once the plan is complete and no ad-hoc is active.
 */
export interface ActiveSlot {
  /** Resolved catalog entry, or `undefined` if the id is dangling. */
  exercise: Exercise | undefined;
  exerciseId: string;
  /** Static target for the planned slot; `null` for ad-hoc (no target). */
  target: StaticTarget | null;
  /** Index of the current block within the ordered blocks (−1 for ad-hoc). */
  blockIndex: number;
  totalBlocks: number;
  /** Current set, 0-based (0 for ad-hoc). */
  setIndex: number;
  /** Sets in the current block (0 for ad-hoc). */
  totalSets: number;
  /** True when the current block is a superset (>= 2 exercises). */
  isSuperset: boolean;
  isAdHoc: boolean;
}

function loadSave(storage: Storage): SaveData {
  return storage.load() ?? emptySaveData();
}

// #region queries

/** The current session, or `null` if none is in progress. */
export function getSession(storage: Storage): Session | null {
  return loadSave(storage).session;
}

/** The session's blocks in effective (possibly deferred) order. */
function orderedBlocks(session: Session): Block[] {
  return applyBlockOrder(session.workout, session.blockOrder).blocks;
}

/** True once the plan cursor has walked past the last block. */
export function isSessionComplete(session: Session): boolean {
  return session.cursor.block >= orderedBlocks(session).length;
}

/**
 * Resolve what the workout screen should show: the ad-hoc exercise if one is active, otherwise the
 * cursor's planned slot. `null` when the plan is complete and no ad-hoc is active.
 */
export function activeSlot(storage: Storage, session: Session): ActiveSlot | null {
  const exercises = loadSave(storage).exercises;
  const find = (id: string): Exercise | undefined => exercises.find((e) => e.id === id);

  if (session.adHoc !== null) {
    return {
      exercise: find(session.adHoc.exerciseId),
      exerciseId: session.adHoc.exerciseId,
      target: null,
      blockIndex: -1,
      totalBlocks: orderedBlocks(session).length,
      setIndex: 0,
      totalSets: 0,
      isSuperset: false,
      isAdHoc: true,
    };
  }

  const blocks = orderedBlocks(session);
  const cursor = session.cursor;
  if (cursor.block >= blocks.length) return null;

  const block = blocks[cursor.block];
  const slot = block.exercises[cursor.exercise];
  return {
    exercise: find(slot.exerciseId),
    exerciseId: slot.exerciseId,
    target: slot.target,
    blockIndex: cursor.block,
    totalBlocks: blocks.length,
    setIndex: cursor.set,
    totalSets: block.sets,
    isSuperset: block.exercises.length >= 2,
    isAdHoc: false,
  };
}

/**
 * Pure predicate for the "продолжить / завершить" prompt. True when the session should be
 * questioned on entry/return: a calendar day has changed since the last activity, or more than
 * `thresholdHours` have elapsed without a logged set. Never fires mid-workout — callers only ask on
 * entry. "Activity" is the last logged set, or the session start if nothing is logged yet.
 */
export function needsResumeDecision(
  session: Session,
  now: number,
  thresholdHours: number,
): boolean {
  const last = session.lastSetAt ?? session.startedAt;
  if (dayIndex(now) !== dayIndex(last)) return true;
  return now - last > thresholdHours * HOUR_MS;
}

// #endregion

// #region cursor

/** Next cursor after logging one planned set of `block`; may point past the last block. */
function advanceCursor(cursor: SessionCursor, block: Block): SessionCursor {
  let { block: b, exercise: e, set: s } = cursor;
  e += 1;
  if (e >= block.exercises.length) {
    e = 0;
    s += 1;
  }
  if (s >= block.sets) {
    b += 1;
    s = 0;
    e = 0;
  }
  return { block: b, exercise: e, set: s };
}

// #endregion

// #region commands

/**
 * Start a session on today's workout (from {@link currentWorkout}). Returns the created session, or
 * `null` if nothing is due (rest day / no active program). Overwrites any existing session — the
 * caller resolves an in-progress one via the continue/finish prompt first.
 */
export function startSession(storage: Storage, clock: Clock): Session | null {
  const workout = currentWorkout(storage, clock);
  if (workout === null) return null;

  const save = loadSave(storage);
  const now = clock.now();
  const session: Session = {
    id: newId(),
    programId: save.activeProgram?.programId ?? '',
    workout,
    blockOrder: workout.blocks.map((b) => b.id),
    cursor: { block: 0, exercise: 0, set: 0 },
    loggedSets: [],
    startedAt: now,
    lastSetAt: null,
    adHoc: null,
    timelinePaused: false,
  };
  save.session = session;
  storage.save(save);
  return session;
}

function pushResult(save: SaveData, exerciseId: string, weight: number, reps: number, now: number): void {
  const result: Result = { id: newId(), exerciseId, timestamp: now, weight, reps };
  save.results = [...save.results, result];
}

/**
 * Log one set at `weight` × `reps`.
 *
 * When an ad-hoc exercise is active the set is written to the {@link Result} history only, leaving
 * the plan cursor untouched. Otherwise the set is written to both history and the session, and the
 * cursor advances; if that finishes the last block the session auto-completes — the scheduler is
 * advanced once and `finished` carries the {@link SessionSummary}.
 *
 * Throws if there is no active session. No-op cursor advance is impossible: a complete session is
 * cleared, so `save.session` is never a finished plan.
 */
export function logSet(
  storage: Storage,
  clock: Clock,
  weight: number,
  reps: number,
): { session: Session | null; finished: SessionSummary | null } {
  const save = loadSave(storage);
  const session = save.session;
  if (session === null) throw new Error('logSet: no active session');

  const now = clock.now();

  if (session.adHoc !== null) {
    pushResult(save, session.adHoc.exerciseId, weight, reps, now);
    session.lastSetAt = now;
    storage.save(save);
    return { session, finished: null };
  }

  const blocks = orderedBlocks(session);
  const slot = blocks[session.cursor.block].exercises[session.cursor.exercise];
  pushResult(save, slot.exerciseId, weight, reps, now);
  session.loggedSets = [...session.loggedSets, { exerciseId: slot.exerciseId, weight, reps, timestamp: now }];
  session.lastSetAt = now;
  session.cursor = advanceCursor(session.cursor, blocks[session.cursor.block]);

  if (session.cursor.block >= blocks.length) {
    return { session: null, finished: completeInternal(storage, clock, save, session) };
  }

  storage.save(save);
  return { session, finished: null };
}

/** Build the summary, clear the session, persist, then advance the scheduler exactly once. */
function completeInternal(
  storage: Storage,
  clock: Clock,
  save: SaveData,
  session: Session,
): SessionSummary {
  const summary = summarize(session, clock.now());
  save.session = null;
  storage.save(save); // persist cleared session + appended results before the scheduler reloads
  advanceSchedule(storage, clock);
  return summary;
}

/**
 * Finish the session now (e.g. the user ends the workout early). Advances the scheduler once and
 * clears the session, returning the summary. Throws if there is no active session.
 */
export function finishSession(storage: Storage, clock: Clock): SessionSummary {
  const save = loadSave(storage);
  const session = save.session;
  if (session === null) throw new Error('finishSession: no active session');
  return completeInternal(storage, clock, save, session);
}

/**
 * Close a stale session WITHOUT advancing the scheduler — the "завершить" branch of the
 * continue/finish prompt. The scheduler is left untouched, so the (hybrid) workout it waited on is
 * offered again as today's; the caller then starts a fresh session on it. No-op if none active.
 */
export function abandonSession(storage: Storage): void {
  const save = loadSave(storage);
  if (save.session === null) return;
  save.session = null;
  storage.save(save);
}

function summarize(session: Session, finishedAt: number): SessionSummary {
  const totalVolume = session.loggedSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  return {
    sessionId: session.id,
    programId: session.programId,
    startedAt: session.startedAt,
    finishedAt,
    sets: session.loggedSets,
    totalVolume,
    setCount: session.loggedSets.length,
  };
}

/**
 * Reorder blocks within the running session ("отложить блок" — swap with the next). Rewrites the
 * session's own {@link Session.blockOrder}. No-op if none active. The cursor keeps addressing the
 * ordered blocks, so deferring the block ahead of the cursor changes what comes next.
 */
export function deferSessionBlock(storage: Storage, blockId: string): void {
  const save = loadSave(storage);
  const session = save.session;
  if (session === null) return;
  const next = deferInOrder(session.blockOrder, blockId);
  if (next === null) return;
  session.blockOrder = next;
  storage.save(save);
}

// #endregion

// #region ad-hoc

/**
 * Start an off-plan exercise. With an active session it becomes active on it (cursor frozen,
 * timeline paused) and the session is returned. With no active session nothing is created and
 * `null` is returned — the UI runs a session-less ad-hoc and logs via {@link logAdHocResult}.
 */
export function startAdHoc(storage: Storage, clock: Clock, exerciseId: string): Session | null {
  const save = loadSave(storage);
  const session = save.session;
  if (session === null) return null;
  session.adHoc = { exerciseId, startedAt: clock.now() };
  session.timelinePaused = true;
  storage.save(save);
  return session;
}

/** End the active ad-hoc exercise and resume the plan (cursor unchanged). No-op if none active. */
export function endAdHoc(storage: Storage): Session | null {
  const save = loadSave(storage);
  const session = save.session;
  if (session === null || session.adHoc === null) return session;
  session.adHoc = null;
  session.timelinePaused = false;
  storage.save(save);
  return session;
}

/**
 * Append one set to the {@link Result} history for `exerciseId` without touching any session. Used
 * by the session-less ad-hoc flow (an off-plan exercise started with no workout running).
 */
export function logAdHocResult(
  storage: Storage,
  clock: Clock,
  exerciseId: string,
  weight: number,
  reps: number,
): Result {
  const save = loadSave(storage);
  const result: Result = { id: newId(), exerciseId, timestamp: clock.now(), weight, reps };
  save.results = [...save.results, result];
  storage.save(save);
  return result;
}

// #endregion
