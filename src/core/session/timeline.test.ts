import { describe, it, expect } from 'vitest';
import { FixedClock, InMemoryStorage } from '../ports/index.ts';
import { emptySaveData } from '../model/index.ts';
import type { Program, PlanDay, SaveData, Block, Session } from '../model/index.ts';
import { DAY_MS } from '../scheduler/day.ts';
import { startProgram } from '../scheduler/active.ts';
import { startSession, logSet, deferSessionBlock, startAdHoc, endAdHoc, getSession } from './session.ts';
import { timelineModel, previewDeferredOrder } from './timeline.ts';

/** A block of one exercise (id === exerciseId), `sets` sets, no rest. */
function block(id: string, sets: number, exerciseIds: string[] = [id]): Block {
  return {
    id,
    sets,
    betweenSetsRest: 0,
    betweenSupersetExercisesRest: 0,
    exercises: exerciseIds.map((eid) => ({
      id: `${id}-${eid}`,
      exerciseId: eid,
      target: { weight: 100, reps: 10 },
    })),
  };
}

function workoutDay(tag: string, blocks: Block[], betweenBlocksRest = 90): PlanDay {
  return { kind: 'workout', workout: { id: tag, blocks, betweenBlocksRest } };
}

function program(id: string, days: PlanDay[]): Program {
  return { id, name: id, plans: [{ id: `${id}-plan`, days }], recommendedSchedulerId: 'hybrid' };
}

function atDay(n: number, extraMs = 0): FixedClock {
  return new FixedClock(n * DAY_MS + extraMs);
}

function storageWith(...programs: Program[]): InMemoryStorage {
  const save: SaveData = { ...emptySaveData(), programs };
  return new InMemoryStorage(save);
}

function launch(store: InMemoryStorage, clock: FixedClock, programId = 'P'): Session {
  startProgram(store, clock, programId);
  const s = startSession(store, clock);
  if (s === null) throw new Error('expected a workout to start');
  return s;
}

describe('timelineModel', () => {
  it('maps blocks to columns of circles, one circle per exercise slot', () => {
    const store = storageWith(
      program('P', [workoutDay('W0', [block('a', 3), block('b', 2, ['x', 'y'])])]),
    );
    const session = launch(store, atDay(0));
    const model = timelineModel(session);

    expect(model.blocks).toHaveLength(2);
    expect(model.blocks[0].dots.map((d) => d.exerciseId)).toEqual(['a']);
    expect(model.blocks[1].dots.map((d) => d.exerciseId)).toEqual(['x', 'y']);
    expect(model.blocks[0].isSuperset).toBe(false);
    expect(model.blocks[1].isSuperset).toBe(true);
    expect(model.betweenBlocksRest).toBe(90);
    expect(model.paused).toBe(false);
  });

  it('marks the current block and leaves later blocks upcoming', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1), block('b', 1), block('c', 1)])]));
    launch(store, atDay(0));

    const before = timelineModel(getSession(store)!);
    expect(before.blocks.map((b) => b.state)).toEqual(['current', 'upcoming', 'upcoming']);
  });

  it('fills a whole block at once when the cursor leaves it', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 2), block('b', 1)])]));
    launch(store, atDay(0));

    // Mid-way through block a (1 of 2 sets): still current, not done.
    logSet(store, atDay(0, 1), 100, 10);
    expect(timelineModel(getSession(store)!).blocks[0].state).toBe('current');

    // Finish block a → it becomes done as a whole, block b becomes current.
    logSet(store, atDay(0, 2), 100, 10);
    expect(timelineModel(getSession(store)!).blocks.map((b) => b.state)).toEqual(['done', 'current']);
  });

  it('reads every block done once the plan is complete', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1), block('b', 1)])]));
    const session = launch(store, atDay(0));

    // Project a cursor that has walked past the last block (session auto-clears on completion, so
    // build the complete-cursor state explicitly).
    const complete: Session = { ...session, cursor: { block: 2, exercise: 0, set: 0 } };
    expect(timelineModel(complete).blocks.map((b) => b.state)).toEqual(['done', 'done']);
  });

  it('only allows deferring upcoming, non-last blocks', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1), block('b', 1), block('c', 1)])]));
    launch(store, atDay(0));
    const model = timelineModel(getSession(store)!);

    // current 'a' cannot defer, upcoming 'b' can (has 'c' after), last 'c' cannot.
    expect(model.blocks.map((b) => b.canDefer)).toEqual([false, true, false]);
  });

  it('reflects a deferred order and the swapped defer-ability', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1), block('b', 1), block('c', 1)])]));
    launch(store, atDay(0));

    deferSessionBlock(store, 'b'); // swap b <-> c
    const model = timelineModel(getSession(store)!);
    expect(model.blocks.map((b) => b.blockId)).toEqual(['a', 'c', 'b']);
    expect(model.blocks.map((b) => b.canDefer)).toEqual([false, true, false]);
  });

  it('sets paused while an ad-hoc exercise is active and clears it on return', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1), block('b', 1)])]));
    launch(store, atDay(0));

    startAdHoc(store, atDay(0, 1), 'z');
    const paused = timelineModel(getSession(store)!);
    expect(paused.paused).toBe(true);
    // Cursor position is preserved for resume: block a is still current.
    expect(paused.blocks[0].state).toBe('current');

    endAdHoc(store);
    expect(timelineModel(getSession(store)!).paused).toBe(false);
  });
});

describe('previewDeferredOrder', () => {
  it('previews the swap without touching the store', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1), block('b', 1), block('c', 1)])]));
    const session = launch(store, atDay(0));

    expect(previewDeferredOrder(session, 'b')).toEqual(['a', 'c', 'b']);
    // A no-op swap (last block) returns the order unchanged.
    expect(previewDeferredOrder(session, 'c')).toEqual(['a', 'b', 'c']);
    // Store is untouched.
    expect(getSession(store)!.blockOrder).toEqual(['a', 'b', 'c']);
  });
});
