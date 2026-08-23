/**
 * Timeline view-model selectors (ticket 07).
 *
 * The workout-screen timeline renders each {@link Block} as a vertical column of circles (one
 * circle per exercise slot) and draws a horizontal line between columns for the `междуБлоками`
 * interval. Intra-block intervals (`междуСетами` / `междуУпражнениямиСуперсета`) are deliberately
 * NOT drawn (spec → Таймлайн).
 *
 * Everything here is a pure function over a {@link Session} (no DOM, no ports) so the widget stays a
 * thin projection. Block colouring is per-block, not per-circle: a block fills as a whole once the
 * cursor has walked past it (spec → "закрашивание — весь блок разом по завершении").
 */

import type { Session, Block } from '../model/index.ts';
import { applyBlockOrder, deferInOrder } from '../scheduler/block-order.ts';

/**
 * Visual state of a whole block on the timeline. `done` = the cursor has left it (all circles
 * filled); `current` = the cursor is inside it (outlined circles + marker); `upcoming` = not yet
 * reached (empty outline). Differentiation is by outline/fill, not colour alone (ticket 14 tunes
 * the palette).
 */
export type TimelineBlockState = 'done' | 'current' | 'upcoming';

/** One circle on the timeline: an exercise slot inside a block. */
export interface TimelineDot {
  /** Catalog ref of the exercise this circle stands for ({@link Exercise.id}). */
  exerciseId: string;
}

/** One column of the timeline: a block rendered as a vertical stack of circles. */
export interface TimelineBlock {
  /** Stable {@link Block.id}; the argument to {@link deferSessionBlock}. */
  blockId: string;
  /** Whole-block colouring state. */
  state: TimelineBlockState;
  /** One entry per exercise slot in the block (>= 1). */
  dots: TimelineDot[];
  /** True when the block is a superset (>= 2 exercises). */
  isSuperset: boolean;
  /**
   * True when the block can be deferred — swapped with the one after it. Only upcoming blocks that
   * are not last qualify: deferring the current block would corrupt the in-progress cursor, and a
   * done or last block has nothing to swap with.
   */
  canDefer: boolean;
}

/** The whole timeline projection for one running session. */
export interface TimelineModel {
  /** Blocks in effective (possibly deferred) order, left → right. */
  blocks: TimelineBlock[];
  /** `междуБлоками` rest, seconds — labels the horizontal line between columns. */
  betweenBlocksRest: number;
  /** True while an ad-hoc exercise pauses the plan; the widget renders dimmed. */
  paused: boolean;
}

/** The session's blocks in effective (possibly deferred) order. */
function orderedBlocks(session: Session): Block[] {
  return applyBlockOrder(session.workout, session.blockOrder).blocks;
}

/**
 * Project a running {@link Session} into the timeline view-model. Block state is derived from the
 * plan cursor: blocks before it are `done`, the block at it is `current`, blocks after it are
 * `upcoming`. Once the cursor has walked past the last block (session complete) every block reads
 * `done`. The ad-hoc pause does not move the cursor — the position is preserved for resume — it only
 * flips {@link TimelineModel.paused}.
 */
export function timelineModel(session: Session): TimelineModel {
  const blocks = orderedBlocks(session);
  const cursorBlock = session.cursor.block;

  return {
    blocks: blocks.map((block, index) => {
      const state: TimelineBlockState =
        index < cursorBlock ? 'done' : index === cursorBlock ? 'current' : 'upcoming';
      return {
        blockId: block.id,
        state,
        dots: block.exercises.map((slot) => ({ exerciseId: slot.exerciseId })),
        isSuperset: block.exercises.length >= 2,
        canDefer: state === 'upcoming' && index < blocks.length - 1,
      };
    }),
    betweenBlocksRest: session.workout.betweenBlocksRest,
    paused: session.timelinePaused,
  };
}

/**
 * The block order that {@link deferSessionBlock} would produce for `blockId`, or the current order
 * unchanged when the swap is a no-op. Exposed so a caller can preview the reorder without a store
 * round-trip; the store command remains the source of truth.
 */
export function previewDeferredOrder(session: Session, blockId: string): string[] {
  return deferInOrder(session.blockOrder, blockId) ?? session.blockOrder.slice();
}
