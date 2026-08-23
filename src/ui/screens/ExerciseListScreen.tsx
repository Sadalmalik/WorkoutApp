import { useMemo, useState } from 'react';
import { ChevronLeft, Search } from 'lucide-react';
import type { Exercise } from '../../core/index.ts';
import { searchExercises } from '../../core/index.ts';

/**
 * Exercise list + search. Search is case-insensitive substring over name and zone (the v1
 * duplicate problem was poor search). The "create new" affordance appears ONLY when a non-empty
 * query yields no matches, and requires an explicit confirmation step — so a user who typed a
 * name that already exists sees the existing entry instead of silently creating a duplicate.
 */
export function ExerciseListScreen({
  exercises,
  onOpen,
  onCreate,
  onBack,
}: {
  exercises: Exercise[];
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);

  const results = useMemo(() => searchExercises(exercises, query), [exercises, query]);
  const trimmed = query.trim();
  const showCreate = trimmed !== '' && results.length === 0;

  return (
    <section className="catalog">
      <header className="catalog__header">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={onBack}>
          <ChevronLeft aria-hidden />
        </button>
        <h1 className="catalog__title">Упражнения</h1>
      </header>

      <div className="catalog__search">
        <Search className="catalog__search-icon" aria-hidden />
        <input
          type="search"
          className="input catalog__search-input"
          placeholder="Поиск по имени или зоне"
          aria-label="Поиск упражнений"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setConfirming(false);
          }}
        />
      </div>

      {results.length > 0 ? (
        <ul className="catalog__list">
          {results.map((ex) => (
            <li key={ex.id}>
              <button type="button" className="catalog__item" onClick={() => onOpen(ex.id)}>
                <span className="catalog__item-name">{ex.name}</span>
                {ex.zone ? <span className="catalog__item-zone">{ex.zone}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="catalog__empty">
          {showCreate ? (
            confirming ? (
              <>
                <p className="catalog__empty-text">
                  Создать новое упражнение «{trimmed}»? Сначала убедись, что его ещё нет.
                </p>
                <div className="catalog__confirm">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => onCreate(trimmed)}
                  >
                    Создать «{trimmed}»
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>
                    Отмена
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="catalog__empty-text">
                  Ничего не найдено по запросу «{trimmed}».
                </p>
                <button type="button" className="btn" onClick={() => setConfirming(true)}>
                  Создать новое упражнение
                </button>
              </>
            )
          ) : (
            <p className="catalog__empty-text">
              Каталог пуст. Начни вводить название в поиске, чтобы создать упражнение.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
