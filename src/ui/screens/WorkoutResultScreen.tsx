import { Check } from 'lucide-react';
import type { SessionSummary } from '../../core/index.ts';

/**
 * Basic end-of-workout result screen (ticket 05 stub).
 *
 * ## Integration point for ticket 09
 * Ticket 09 replaces the body with personal records / progress, the full summary (volume, set
 * count, duration) and the per-exercise charts, keeping this component's single prop —
 * {@link SessionSummary} — as its input. The scheduler has already advanced by the time this
 * renders (the session auto-completed); "Готово" only returns to Home.
 */
export function WorkoutResultScreen({
  summary,
  onDone,
}: {
  summary: SessionSummary;
  onDone: () => void;
}) {
  const minutes = Math.max(1, Math.round((summary.finishedAt - summary.startedAt) / 60_000));
  return (
    <section className="screen result">
      <h1 className="screen__title">Тренировка завершена</h1>

      <div className="result__summary" aria-label="Сводка">
        <SummaryStat label="Сетов" value={String(summary.setCount)} />
        <SummaryStat label="Объём" value={`${summary.totalVolume} кг`} />
        <SummaryStat label="Время" value={`${minutes} мин`} />
      </div>

      <p className="screen__note">Рекорды, графики и подробная сводка — тикет 09.</p>

      <div className="form__actions">
        <button type="button" className="btn btn--primary" onClick={onDone}>
          <Check aria-hidden /> Готово
        </button>
      </div>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="result__stat">
      <span className="result__stat-value">{value}</span>
      <span className="result__stat-label">{label}</span>
    </div>
  );
}
