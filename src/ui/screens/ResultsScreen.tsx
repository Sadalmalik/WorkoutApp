import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { Exercise, Result } from '../../core/index.ts';
import { ExerciseProgress } from '../components/ExerciseProgress.tsx';

/**
 * Results tab (ticket 09): pick an exercise that has recorded history, then see its progress chart
 * with the report switcher. Only exercises with at least one result are listed — an empty catalog or
 * an untrained exercise has nothing to chart.
 */
export function ResultsScreen({ results, exercises }: { results: Result[]; exercises: Exercise[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const charted = useMemo(() => {
    const withResults = new Set(results.map((r) => r.exerciseId));
    return exercises
      .filter((e) => withResults.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [results, exercises]);

  const selected = selectedId !== null ? charted.find((e) => e.id === selectedId) ?? null : null;

  if (selected !== null) {
    return (
      <section className="catalog">
        <header className="catalog__header">
          <button type="button" className="icon-btn" aria-label="Назад" onClick={() => setSelectedId(null)}>
            <ChevronLeft aria-hidden />
          </button>
          <h1 className="catalog__title">{selected.name}</h1>
        </header>
        <div className="catalog__progress">
          <ExerciseProgress exercise={selected} results={results} />
        </div>
      </section>
    );
  }

  return (
    <section className="catalog">
      <header className="catalog__header">
        <h1 className="catalog__title">Прогресс</h1>
      </header>
      {charted.length === 0 ? (
        <div className="catalog__empty">
          <p className="catalog__empty-text">Нет записанных результатов. Проведи тренировку, чтобы увидеть графики.</p>
        </div>
      ) : (
        <ul className="catalog__list">
          {charted.map((ex) => (
            <li key={ex.id}>
              <button type="button" className="catalog__item" onClick={() => setSelectedId(ex.id)}>
                <span className="catalog__item-name">{ex.name}</span>
                {ex.zone ? <span className="catalog__item-zone">{ex.zone}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
