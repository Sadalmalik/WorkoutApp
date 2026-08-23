import { useState } from 'react';
import type { Clock, Storage, Exercise } from '../../core/index.ts';
import {
  DEFAULT_WEIGHT_STEP,
  getSession,
  getExercise,
  startAdHoc,
  logAdHocResult,
} from '../../core/index.ts';
import { navigate, ROUTES, navigateToSession } from '../router.ts';
import { WorkoutScreen } from './WorkoutScreen.tsx';
import { ExercisePicker } from '../components/ExercisePicker.tsx';

/**
 * Ad-hoc ("+") flow (ticket 05). Reached from the bottom-nav "+" button.
 *
 * - If a workout session is running, picking an exercise attaches it as ad-hoc on that session
 *   ({@link startAdHoc}) and jumps to the session screen — its sets go to history without moving
 *   the plan cursor.
 * - With no session, it runs a session-less ad-hoc: sets are written straight to the results
 *   history via {@link logAdHocResult}, no {@link Session} is created, and finishing returns Home.
 */
export function AdHocScreen({
  storage,
  clock,
  exercises,
  onChange,
}: {
  storage: Storage;
  clock: Clock;
  exercises: Exercise[];
  onChange: () => void;
}) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const hasSession = getSession(storage) !== null;

  if (exercise === null) {
    return (
      <ExercisePicker
        exercises={exercises}
        title="Внеплановое упражнение"
        onPick={(id) => {
          if (getSession(storage) !== null) {
            startAdHoc(storage, clock, id);
            onChange();
            navigateToSession();
            return;
          }
          const picked = getExercise(storage, id) ?? null;
          setExercise(picked);
        }}
        onCancel={() => {
          if (hasSession) navigateToSession();
          else navigate(ROUTES.home);
        }}
      />
    );
  }

  return (
    <StandaloneAdHoc
      exercise={exercise}
      onLog={(weight, reps) => {
        logAdHocResult(storage, clock, exercise.id, weight, reps);
        onChange();
      }}
      onExit={() => {
        onChange();
        navigate(ROUTES.home);
      }}
    />
  );
}

/** Session-less ad-hoc: one exercise, basic input, results written to history only. */
function StandaloneAdHoc({
  exercise,
  onLog,
  onExit,
}: {
  exercise: Exercise;
  onLog: (weight: number, reps: number) => void;
  onExit: () => void;
}) {
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(1);
  const [count, setCount] = useState(0);

  return (
    <WorkoutScreen
      header={{
        exerciseName: exercise.name,
        zone: exercise.zone,
        targetText: 'Внеплановое',
        progressText: count > 0 ? `Записано сетов: ${count}` : 'Внеплановое упражнение',
        videoUrl: exercise.videoLinks[0] ?? null,
      }}
      input={{
        weight,
        reps,
        weightStep: exercise.equipmentWeightStep || DEFAULT_WEIGHT_STEP,
        onWeight: setWeight,
        onReps: setReps,
      }}
      onLog={() => {
        onLog(weight, reps);
        setCount((c) => c + 1);
      }}
      logLabel="Записать (внеплановое)"
      onExit={onExit}
    />
  );
}
