import { useMemo, useState } from 'react';
import type { Exercise, Result } from '../../core/index.ts';
import { exerciseDayPoints, EXERCISE_REPORTS } from '../../core/index.ts';
import { ProgressChart } from './ProgressChart.tsx';

/**
 * Progress block for one exercise: a report switcher over the {@link ProgressChart}.
 *
 * The day points are derived once from history (independent of the report — ADR 0002); switching the
 * report only changes how those points are interpreted, never the points themselves. The bodyweight
 * flag decides the key metric (reps vs weight), so it is threaded into every report factory.
 */
export function ExerciseProgress({
  exercise,
  results,
  title,
}: {
  exercise: Exercise;
  results: readonly Result[];
  /** Optional heading (e.g. the exercise name on the result screen); omitted on the editor. */
  title?: string;
}) {
  const [reportId, setReportId] = useState(EXERCISE_REPORTS[0].id);

  const points = useMemo(
    () => exerciseDayPoints(results, exercise.id, exercise.isBodyweight),
    [results, exercise.id, exercise.isBodyweight],
  );

  const descriptor = EXERCISE_REPORTS.find((d) => d.id === reportId) ?? EXERCISE_REPORTS[0];
  const report = useMemo(() => descriptor.make(exercise.isBodyweight), [descriptor, exercise.isBodyweight]);

  return (
    <section className="exercise-progress" aria-label={title ? `Прогресс: ${title}` : 'Прогресс'}>
      <header className="exercise-progress__head">
        {title ? <h3 className="exercise-progress__title">{title}</h3> : null}
        <div className="exercise-progress__reports" role="group" aria-label="Отчёт">
          {EXERCISE_REPORTS.map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip"
              data-active={d.id === descriptor.id || undefined}
              aria-pressed={d.id === descriptor.id}
              onClick={() => setReportId(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </header>
      <ProgressChart points={points} report={report} />
    </section>
  );
}
