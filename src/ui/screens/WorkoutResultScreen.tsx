import { useMemo, useRef, useState } from 'react';
import { Check, Trophy } from 'lucide-react';
import type { Exercise, PersonalRecord, Result, SessionSummary } from '../../core/index.ts';
import { detectPersonalRecords, sessionStats } from '../../core/index.ts';
import { ExerciseProgress } from '../components/ExerciseProgress.tsx';

/**
 * End-of-workout result screen (ticket 09).
 *
 * Order, top to bottom: personal records set this session → summary (volume / sets / duration) →
 * a vertical list of progress charts for the exercises trained today. A pinned footer holds
 * «Далее» (scroll to the next chart, or finish on the last) and «Закрыть» (return home).
 *
 * Records compare the session's best against the history recorded BEFORE the session started; since
 * every set is appended to `results` live, the prior slice is `timestamp < summary.startedAt`.
 */
export function WorkoutResultScreen({
  summary,
  results,
  exercises,
  onDone,
}: {
  summary: SessionSummary;
  results: Result[];
  exercises: Exercise[];
  onDone: () => void;
}) {
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const isBodyweight = (id: string) => exerciseById.get(id)?.isBodyweight ?? false;

  const stats = useMemo(
    () => sessionStats(summary.sets, summary.startedAt, summary.finishedAt),
    [summary],
  );

  const records = useMemo(() => {
    const prior = results.filter((r) => r.timestamp < summary.startedAt);
    return detectPersonalRecords(prior, summary.sets, isBodyweight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, summary]);

  // Distinct exercises trained today, in first-seen order, resolved to catalog entries.
  const todaysExercises = useMemo(() => {
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const s of summary.sets) {
      if (seen.has(s.exerciseId)) continue;
      seen.add(s.exerciseId);
      const ex = exerciseById.get(s.exerciseId);
      if (ex !== undefined) out.push(ex);
    }
    return out;
  }, [summary, exerciseById]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const chartRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [index, setIndex] = useState(0);

  const minutes = Math.max(1, Math.round(stats.durationMs / 60_000));

  function next() {
    const target = index + 1;
    if (target >= todaysExercises.length) {
      onDone();
      return;
    }
    setIndex(target);
    chartRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const hasCharts = todaysExercises.length > 0;
  const onLast = index >= todaysExercises.length - 1;

  return (
    <section className="result-screen">
      <div className="result-screen__scroll" ref={scrollRef}>
        <h1 className="screen__title">Тренировка завершена</h1>

        <RecordList records={records} exerciseById={exerciseById} />

        <div className="result__summary" aria-label="Сводка">
          <SummaryStat label="Объём" value={`${stats.volume} кг`} />
          <SummaryStat label="Сетов" value={String(stats.setCount)} />
          <SummaryStat label="Время" value={`${minutes} мин`} />
        </div>

        {hasCharts ? (
          <div className="result-screen__charts">
            {todaysExercises.map((ex, i) => (
              <div
                key={ex.id}
                className="result-screen__chart"
                ref={(el) => {
                  chartRefs.current[i] = el;
                }}
              >
                <ExerciseProgress exercise={ex} results={results} title={ex.name} />
              </div>
            ))}
          </div>
        ) : (
          <p className="screen__note">Сегодня не записано ни одного сета.</p>
        )}
      </div>

      <div className="result-screen__footer">
        {hasCharts && todaysExercises.length > 1 ? (
          <button type="button" className="btn btn--ghost" onClick={next}>
            {onLast ? 'К началу' : 'Далее'}
          </button>
        ) : null}
        <button type="button" className="btn btn--primary" onClick={onDone}>
          <Check aria-hidden /> Закрыть
        </button>
      </div>
    </section>
  );
}

function RecordList({
  records,
  exerciseById,
}: {
  records: PersonalRecord[];
  exerciseById: Map<string, Exercise>;
}) {
  if (records.length === 0) return null;
  return (
    <div className="records" aria-label="Личные рекорды">
      <h2 className="records__title">
        <Trophy aria-hidden /> Личные рекорды
      </h2>
      <ul className="records__list">
        {records.map((r) => (
          <li key={`${r.exerciseId}-${r.kind}`} className="records__item">
            <span className="records__name">{exerciseById.get(r.exerciseId)?.name ?? '—'}</span>
            <span className="records__detail">{recordText(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function recordText(r: PersonalRecord): string {
  const unit = r.kind === 'weight' ? 'кг' : 'повт.';
  const now = `${r.value} ${unit}`;
  if (r.previous === null) return `${now} · впервые`;
  return `${now} · было ${r.previous} ${unit}`;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="result__stat">
      <span className="result__stat-value">{value}</span>
      <span className="result__stat-label">{label}</span>
    </div>
  );
}
