import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Exercise } from '../../core/index.ts';
import { searchExercises } from '../../core/index.ts';

/**
 * Modal picker over the exercise catalog, reusing the ticket-02 `searchExercises` (case-insensitive
 * substring over name and zone). Each result shows the zone and video-link count so the author can
 * pick the right movement while designing the program. Read-only: it never creates exercises
 * (that stays in the catalog editor), it only selects an existing one.
 */
export function ExercisePicker({
  exercises,
  title,
  onPick,
  onCancel,
}: {
  exercises: Exercise[];
  title: string;
  onPick: (exerciseId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchExercises(exercises, query), [exercises, query]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <header className="picker__header">
          <h2 className="picker__title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onCancel}>
            <X aria-hidden />
          </button>
        </header>

        <div className="catalog__search">
          <Search className="catalog__search-icon" aria-hidden />
          <input
            type="search"
            className="input catalog__search-input"
            placeholder="Поиск по имени или зоне"
            aria-label="Поиск упражнений"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {results.length === 0 ? (
          <p className="catalog__empty-text">
            {exercises.length === 0
              ? 'Каталог упражнений пуст. Сначала добавь упражнения в разделе «Каталог упражнений».'
              : 'Ничего не найдено.'}
          </p>
        ) : (
          <ul className="catalog__list picker__list">
            {results.map((ex) => (
              <li key={ex.id}>
                <button type="button" className="catalog__item" onClick={() => onPick(ex.id)}>
                  <span className="catalog__item-name">{ex.name}</span>
                  <span className="picker__meta">
                    {ex.zone ? <span className="catalog__item-zone">{ex.zone}</span> : null}
                    {ex.videoLinks.length > 0 ? (
                      <span className="picker__videos">{ex.videoLinks.length} видео</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
