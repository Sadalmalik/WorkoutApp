/**
 * Rest timer core (ticket 08) — pure, DOM-free countdown logic.
 *
 * The v1 timer accumulated error and lagged when the tab was backgrounded because it counted by
 * summing elapsed ticks. This core removes drift by construction: a running timer stores an
 * ABSOLUTE deadline `endAt = clock.now() + durationMs`, and the remaining time is always recomputed
 * as `endAt - now`. Ticks (rAF/interval in the UI) only trigger a re-render; they never advance an
 * internal counter, so no error can accumulate and a large forward time jump (backgrounding, sleep,
 * a clock skip) yields the correct remaining/expired state immediately.
 *
 * All functions are pure over an injected time value (epoch ms via the {@link Clock} port), so the
 * behaviour is deterministic under `FixedClock` in tests (ARCH invariant #1: no DOM in core).
 *
 * ## State
 * {@link TimerState} is a plain value; at most one of `endAt` / `pausedRemainingMs` is non-null:
 * - idle    — both null; the timer shows its preset {@link TimerState.durationMs}.
 * - running — `endAt` is the absolute deadline; remaining = `endAt - now`, clamped at 0.
 * - paused  — `pausedRemainingMs` freezes the remaining time; a background jump while paused does
 *             not consume it (it resumes from exactly where it stopped).
 * - finished— derived, not stored: a running timer whose `now >= endAt`.
 */

import type { Session } from '../model/entities.ts';
import { applyBlockOrder } from '../scheduler/block-order.ts';

export type TimerPhase = 'idle' | 'running' | 'paused' | 'finished';

export interface TimerState {
  /** Preset length in ms — what the timer shows when idle and returns to on {@link resetTimer}. */
  readonly durationMs: number;
  /** Absolute epoch-ms deadline while running; `null` when idle or paused. */
  readonly endAt: number | null;
  /** Frozen remaining ms while paused; `null` when idle or running. */
  readonly pausedRemainingMs: number | null;
}

/** Milliseconds left until `endAt`, never negative. The single anti-drift primitive. */
export function remainingMs(endAt: number, now: number): number {
  return Math.max(0, endAt - now);
}

function clampMs(ms: number): number {
  return Math.max(0, Math.round(ms));
}

/** A fresh idle timer preset to `durationMs` (rounded, clamped at 0). */
export function createTimer(durationMs: number): TimerState {
  return { durationMs: clampMs(durationMs), endAt: null, pausedRemainingMs: null };
}

/** Derived phase for `now`. `finished` is a running timer whose deadline has passed. */
export function timerPhase(state: TimerState, now: number): TimerPhase {
  if (state.endAt !== null) return now >= state.endAt ? 'finished' : 'running';
  if (state.pausedRemainingMs !== null) return 'paused';
  return 'idle';
}

/**
 * Remaining ms to display for `now`:
 * - running → recomputed from the absolute deadline (`endAt - now`, clamped);
 * - paused  → the frozen value;
 * - idle    → the preset duration.
 */
export function timerRemaining(state: TimerState, now: number): number {
  if (state.endAt !== null) return remainingMs(state.endAt, now);
  if (state.pausedRemainingMs !== null) return state.pausedRemainingMs;
  return state.durationMs;
}

/** True once a running timer has reached/passed its deadline. False when idle/paused. */
export function isExpired(state: TimerState, now: number): boolean {
  return state.endAt !== null && now >= state.endAt;
}

export function isRunning(state: TimerState): boolean {
  return state.endAt !== null;
}

/**
 * Start (or resume) the countdown: the deadline becomes `now + base`, where `base` is the frozen
 * paused remainder if paused, otherwise the preset duration. A zero base is a no-op (nothing to
 * count down). Restarting a finished/running timer re-arms it from the preset.
 */
export function startTimer(state: TimerState, now: number): TimerState {
  const base = state.pausedRemainingMs ?? state.durationMs;
  if (base <= 0) return state;
  return { durationMs: state.durationMs, endAt: now + base, pausedRemainingMs: null };
}

/** Freeze a running timer at its current remaining. No-op when not running. */
export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.endAt === null) return state;
  return { durationMs: state.durationMs, endAt: null, pausedRemainingMs: remainingMs(state.endAt, now) };
}

/** Back to idle at the preset {@link TimerState.durationMs} (cancels a run or pause). */
export function resetTimer(state: TimerState): TimerState {
  return { durationMs: state.durationMs, endAt: null, pausedRemainingMs: null };
}

/**
 * Adjust the time by `deltaMs` (the ±1/10/30/60 s increment buttons pass ms):
 * - running → shift the absolute deadline, never below `now` (remaining clamped at 0);
 * - paused  → adjust the frozen remainder, clamped at 0;
 * - idle    → adjust the preset duration, clamped at 0.
 *
 * The absolute-deadline shift keeps a running timer drift-free after the change.
 */
export function addTime(state: TimerState, deltaMs: number, now: number): TimerState {
  if (state.endAt !== null) {
    return { ...state, endAt: Math.max(now, state.endAt + deltaMs) };
  }
  if (state.pausedRemainingMs !== null) {
    return { ...state, pausedRemainingMs: clampMs(state.pausedRemainingMs + deltaMs) };
  }
  return { ...state, durationMs: clampMs(state.durationMs + deltaMs) };
}

/**
 * Recommended rest interval (seconds) to preload for the session's current cursor place:
 * - within a superset, between its exercises → `betweenSupersetExercisesRest`;
 * - between sets of the current block         → `betweenSetsRest`;
 * - after the last set of a block             → `betweenBlocksRest` (unless it is the last block).
 *
 * Ad-hoc (off-plan) exercises have no plan cadence; the workout's `betweenBlocksRest` is used as a
 * neutral default. Pure over the {@link Session}; used by the UI to preset the timer.
 */
export function recommendedRestSeconds(session: Session): number {
  const workout = session.workout;
  if (session.adHoc !== null) return workout.betweenBlocksRest;

  const blocks = applyBlockOrder(workout, session.blockOrder).blocks;
  const cursor = session.cursor;
  if (cursor.block >= blocks.length) return workout.betweenBlocksRest;

  const block = blocks[cursor.block];
  const isSuperset = block.exercises.length >= 2;
  const restingBetweenSupersetExercises = isSuperset && cursor.exercise < block.exercises.length - 1;
  if (restingBetweenSupersetExercises) return block.betweenSupersetExercisesRest;

  const isLastSet = cursor.set >= block.sets - 1;
  if (!isLastSet) return block.betweenSetsRest;

  const isLastBlock = cursor.block >= blocks.length - 1;
  return isLastBlock ? block.betweenSetsRest : workout.betweenBlocksRest;
}
