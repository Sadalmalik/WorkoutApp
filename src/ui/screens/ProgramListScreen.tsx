import { useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import type { Program } from '../../core/index.ts';

/**
 * Program list. Unlike the exercise catalog, programs are few and duplicate names are harmless,
 * so creation is a simple named-create (no anti-duplicate confirmation step). Opening a row goes
 * to the linear editor.
 */
export function ProgramListScreen({
  programs,
  onOpen,
  onCreate,
  onBack,
}: {
  programs: Program[];
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  return (
    <section className="catalog">
      <header className="catalog__header">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={onBack}>
          <ChevronLeft aria-hidden />
        </button>
        <h1 className="catalog__title">Программы</h1>
      </header>

      <form
        className="field__row"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed === '') return;
          onCreate(trimmed);
          setName('');
        }}
      >
        <input
          className="input"
          placeholder="Название новой программы"
          aria-label="Название новой программы"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={trimmed === ''}>
          <Plus aria-hidden /> Создать
        </button>
      </form>

      {programs.length > 0 ? (
        <ul className="catalog__list">
          {programs.map((p) => (
            <li key={p.id}>
              <button type="button" className="catalog__item" onClick={() => onOpen(p.id)}>
                <span className="catalog__item-name">{p.name}</span>
                <span className="catalog__item-zone">
                  {p.plans[0] ? `${p.plans[0].days.length} дн.` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="catalog__empty-text">Программ пока нет. Введи название выше, чтобы создать.</p>
      )}
    </section>
  );
}
