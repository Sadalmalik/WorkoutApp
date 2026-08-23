import { useEffect, useRef, useState } from 'react';
import type { Clock, Storage, SaveData, Session, SessionSummary, ActiveSlot } from '../../core/index.ts';
import {
  DEFAULT_WEIGHT_STEP,
  getSession,
  needsResumeDecision,
  startSession,
  abandonSession,
  logSet,
  editSessionSet,
  removeSessionSet,
  activeSlot,
  endAdHoc,
} from '../../core/index.ts';
import { navigate, ROUTES } from '../router.ts';
import { WorkoutScreen } from './WorkoutScreen.tsx';
import { WorkoutResultScreen } from './WorkoutResultScreen.tsx';
import { ExercisePicker } from '../components/ExercisePicker.tsx';
import { SetInputPanel, ResultsTable, parseNum } from '../components/ResultsTable.tsx';
import type { SetRow } from '../components/ResultsTable.tsx';
import { startAdHoc } from '../../core/index.ts';

/**
 * Session container (ticket 05) — replaces the ticket-04 stub, keeping the `#/session` route.
 *
 * Drives the whole workout run: it resolves the current session on entry (starting one on today's
 * workout if none exists), asks продолжить/завершить when {@link needsResumeDecision} fires, logs
 * sets through the core, and shows the basic result screen on completion. The single
 * `advanceSchedule` call the stub owned now lives inside the core (`logSet` auto-completion), so
 * this screen never advances the scheduler itself.
 */
type ScreenState =
  | { kind: 'loading' }
  | { kind: 'resume'; session: Session }
  | { kind: 'active'; session: Session }
  | { kind: 'finished'; summary: SessionSummary };

export function SessionScreen({
  storage,
  clock,
  save,
  onChange,
}: {
  storage: Storage;
  clock: Clock;
  save: SaveData;
  onChange: () => void;
}) {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [picking, setPicking] = useState(false);
  const didInit = useRef(false);

  // Resolve the session exactly once on entry (StrictMode-safe via the ref guard).
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const existing = getSession(storage);
    if (existing !== null) {
      const needsPrompt = needsResumeDecision(
        existing,
        clock.now(),
        save.settings.continueThresholdHours,
      );
      setState(needsPrompt ? { kind: 'resume', session: existing } : { kind: 'active', session: existing });
      return;
    }

    const started = startSession(storage, clock);
    if (started === null) {
      navigate(ROUTES.home); // nothing due (rest day / no program)
      return;
    }
    onChange();
    setState({ kind: 'active', session: started });
  }, [storage, clock, save.settings.continueThresholdHours, onChange]);

  function goHome() {
    onChange();
    navigate(ROUTES.home);
  }

  if (state.kind === 'loading') return null;

  if (state.kind === 'finished') {
    return (
      <WorkoutResultScreen
        summary={state.summary}
        results={save.results}
        exercises={save.exercises}
        onDone={goHome}
      />
    );
  }

  if (state.kind === 'resume') {
    return (
      <ResumePrompt
        onContinue={() => setState({ kind: 'active', session: state.session })}
        onFinish={() => {
          abandonSession(storage);
          onChange();
          const fresh = startSession(storage, clock);
          if (fresh === null) {
            navigate(ROUTES.home);
            return;
          }
          onChange();
          setState({ kind: 'active', session: fresh });
        }}
      />
    );
  }

  // Active session.
  const session = state.session;
  const slot = activeSlot(storage, session);
  if (slot === null) {
    // Plan complete but not auto-finished (defensive); bounce home.
    navigate(ROUTES.home);
    return null;
  }

  function handleLog(weight: number, reps: number) {
    const { session: next, finished } = logSet(storage, clock, weight, reps);
    onChange();
    if (finished !== null) {
      setState({ kind: 'finished', summary: finished });
      return;
    }
    setState({ kind: 'active', session: next! });
  }

  function handleEdit(index: number, weight: number, reps: number) {
    const next = editSessionSet(storage, index, weight, reps);
    onChange();
    if (next !== null) setState({ kind: 'active', session: next });
  }

  function handleRemove(index: number) {
    const next = removeSessionSet(storage, index);
    onChange();
    if (next !== null) setState({ kind: 'active', session: next });
  }

  function pickAdHoc(exerciseId: string) {
    setPicking(false);
    const updated = startAdHoc(storage, clock, exerciseId);
    onChange();
    if (updated !== null) setState({ kind: 'active', session: updated });
  }

  function resumePlan() {
    const updated = endAdHoc(storage);
    onChange();
    if (updated !== null) setState({ kind: 'active', session: updated });
  }

  return (
    <>
      <ActiveWorkout
        slot={slot}
        session={session}
        weightStepFallback={DEFAULT_WEIGHT_STEP}
        onLog={handleLog}
        onEdit={handleEdit}
        onRemove={handleRemove}
        onExit={() => navigate(ROUTES.home)}
        onAddAdHoc={() => setPicking(true)}
        onResumePlan={slot.isAdHoc ? resumePlan : undefined}
      />
      {picking ? (
        <ExercisePicker
          exercises={save.exercises}
          title="Внеплановое упражнение"
          onPick={pickAdHoc}
          onCancel={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

/** The продолжить/завершить prompt shown on entry when {@link needsResumeDecision} fires. */
function ResumePrompt({ onContinue, onFinish }: { onContinue: () => void; onFinish: () => void }) {
  return (
    <section className="screen">
      <h1 className="screen__title">Незавершённая тренировка</h1>
      <p className="screen__note">
        Есть незавершённая сессия. Продолжить её или завершить и начать сегодняшнюю тренировку?
      </p>
      <div className="form__actions">
        <button type="button" className="btn btn--primary" onClick={onContinue}>
          Продолжить
        </button>
        <button type="button" className="btn btn--ghost" onClick={onFinish}>
          Завершить
        </button>
      </div>
    </section>
  );
}

/**
 * Adapts an {@link ActiveSlot} to the presentational {@link WorkoutScreen}, driving the ticket-06
 * widget: it owns the weight/reps input buffers and enforces the v1 UX rule — after logging, the
 * weight is kept for the next set while the reps are cleared. Edit/remove are delegated to the
 * container (core `editSessionSet`/`removeSessionSet`).
 */
function ActiveWorkout({
  slot,
  session,
  weightStepFallback,
  onLog,
  onEdit,
  onRemove,
  onExit,
  onAddAdHoc,
  onResumePlan,
}: {
  slot: ActiveSlot;
  session: Session;
  weightStepFallback: number;
  onLog: (weight: number, reps: number) => void;
  onEdit: (index: number, weight: number, reps: number) => void;
  onRemove: (index: number) => void;
  onExit: () => void;
  onAddAdHoc: () => void;
  onResumePlan?: () => void;
}) {
  const [weight, setWeight] = useState(slot.target ? String(slot.target.weight) : '');
  const [reps, setReps] = useState(slot.target ? String(slot.target.reps) : '');

  // Reset the inputs to the slot's target when the exercise changes (weight is kept across sets of
  // the same exercise, so the key intentionally excludes the set index).
  const slotKey = `${slot.isAdHoc ? 'adhoc' : 'plan'}:${slot.blockIndex}:${slot.exerciseId}`;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === slotKey) return;
    lastKey.current = slotKey;
    setWeight(slot.target ? String(slot.target.weight) : '');
    setReps(slot.target ? String(slot.target.reps) : '');
  }, [slotKey, slot.target]);

  const weightStep = slot.exercise?.equipmentWeightStep ?? weightStepFallback;
  const parsedWeight = parseNum(weight);
  const parsedReps = parseNum(reps);
  const canAdd = parsedWeight !== null && parsedWeight >= 0 && parsedReps !== null && parsedReps >= 1;

  function add() {
    if (parsedWeight === null || parsedReps === null) return;
    onLog(parsedWeight, parsedReps);
    // v1 UX: keep the weight for the next set, clear the reps.
    setReps('');
  }

  // Logged sets of the current exercise, carrying their global index for core edit/remove.
  const rows: SetRow[] = session.loggedSets
    .map((s, index) => ({ set: s, index }))
    .filter(({ set }) => set.exerciseId === slot.exerciseId)
    .map(({ set, index }) => ({ index, weight: set.weight, reps: set.reps }));

  const name = slot.exercise?.name ?? '(упражнение удалено)';
  const targetText = slot.target !== null ? `${slot.target.weight} кг × ${slot.target.reps}` : 'Внеплановое';
  const progressText = slot.isAdHoc
    ? 'Внеплановое упражнение'
    : `Блок ${slot.blockIndex + 1}/${slot.totalBlocks} · сет ${slot.setIndex + 1}/${slot.totalSets}` +
      (slot.isSuperset ? ' · суперсет' : '');

  return (
    <WorkoutScreen
      header={{
        exerciseName: name,
        zone: slot.exercise?.zone,
        targetText,
        progressText,
        videoUrl: slot.exercise?.videoLinks[0] ?? null,
        restHint: `${session.workout.betweenBlocksRest} с`,
      }}
      inputSlot={
        <SetInputPanel
          weight={weight}
          reps={reps}
          weightStep={weightStep}
          onWeight={setWeight}
          onReps={setReps}
          onAdd={add}
          canAdd={canAdd}
          addLabel={slot.isAdHoc ? 'Записать (внеплановое)' : 'Добавить сет'}
        />
      }
      onExit={onExit}
      tableSlot={
        <ResultsTable
          rows={rows}
          weightStep={weightStep}
          onEdit={onEdit}
          onRemove={onRemove}
          emptyNote={
            slot.isAdHoc ? 'Внеплановые сеты не отображаются здесь' : 'Пока нет записанных сетов'
          }
        />
      }
      timelineSlot={<PlanDots slot={slot} session={session} />}
      headerAction={
        onResumePlan ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onResumePlan}>
            К плану
          </button>
        ) : (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onAddAdHoc}>
            + внеплановое
          </button>
        )
      }
    />
  );
}

/** Placeholder timeline (ticket 07 replaces): one dot per block, filled up to the cursor. */
function PlanDots({ slot, session }: { slot: ActiveSlot; session: Session }) {
  return (
    <div className="plandots" aria-label="Прогресс по блокам">
      {session.blockOrder.map((id, i) => (
        <span
          key={id}
          className="plandots__dot"
          data-done={!slot.isAdHoc && i < slot.blockIndex ? true : undefined}
          data-current={!slot.isAdHoc && i === slot.blockIndex ? true : undefined}
        />
      ))}
      {session.timelinePaused ? <span className="plandots__paused">приостановлен</span> : null}
    </div>
  );
}
