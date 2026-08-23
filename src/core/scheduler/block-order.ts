/**
 * Block reordering for {@link Scheduler.deferBlock} ("отложить блок").
 *
 * A scheduler state may hold an explicit ordering of the current workout's block ids. Deferring a
 * block swaps it with the one after it. The ordering is established by whoever is running the
 * workout — in Phase 1 that is the session layer (ticket 05); see `deferCurrentBlock` in
 * `active.ts`, which seeds the order from the live workout before the first swap. `deferBlock`
 * itself is pure: given `state` + `blockId` it only rewrites the stored order, because the
 * interface intentionally does not hand it the program/clock.
 */

import type { Workout } from '../model/index.ts';

/**
 * Return `workout` with its blocks reordered to follow `order`. A no-op (returns the input) when
 * `order` is null or does not cover exactly the workout's block ids — so a stale order left over
 * from a different workout is ignored rather than dropping/duplicating blocks.
 */
export function applyBlockOrder(workout: Workout, order: readonly string[] | null): Workout {
  if (order === null) return workout;

  const ids = workout.blocks.map((b) => b.id);
  const sameSet = order.length === ids.length && order.every((id) => ids.includes(id));
  if (!sameSet) return workout;

  const byId = new Map(workout.blocks.map((b) => [b.id, b]));
  return { ...workout, blocks: order.map((id) => byId.get(id)!) };
}

/**
 * Swap `blockId` with its successor inside `order`, returning the new order. A no-op (returns the
 * same reference) when `order` is null (no order established yet), `blockId` is absent, or it is
 * already last.
 */
export function deferInOrder(
  order: readonly string[] | null,
  blockId: string,
): string[] | null {
  if (order === null) return null;
  const i = order.indexOf(blockId);
  if (i === -1 || i === order.length - 1) return order.slice();

  const next = order.slice();
  [next[i], next[i + 1]] = [next[i + 1], next[i]];
  return next;
}
