import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import type { Exercise, ExerciseDraft } from '../../core/index.ts';
import { DEFAULT_WEIGHT_STEP } from '../../core/index.ts';

/**
 * Exercise editor: a form over every catalog field. Zone uses a `<datalist>` fed by the zones
 * already present in the catalog (autocomplete without constraining to them). Muscle links are
 * Phase 2 and intentionally have no UI here.
 */
export function ExerciseEditorScreen({
  exercise,
  zones,
  onSave,
  onCancel,
  progress,
}: {
  exercise: Exercise | undefined;
  zones: string[];
  onSave: (draft: ExerciseDraft) => void;
  onCancel: () => void;
  /** Progress chart for an existing exercise (ticket 09); omitted when creating a new one. */
  progress?: ReactNode;
}) {
  const zonesListId = useId();
  const [name, setName] = useState(exercise?.name ?? '');
  const [zone, setZone] = useState(exercise?.zone ?? '');
  const [videoLinks, setVideoLinks] = useState<string[]>(
    exercise && exercise.videoLinks.length > 0 ? exercise.videoLinks : [''],
  );
  const [isBodyweight, setIsBodyweight] = useState(exercise?.isBodyweight ?? false);
  const [weightStep, setWeightStep] = useState(
    String(exercise?.equipmentWeightStep ?? DEFAULT_WEIGHT_STEP),
  );
  const [notes, setNotes] = useState(exercise?.notes ?? '');

  const nameValid = name.trim() !== '';
  const parsedStep = Number(weightStep.replace(',', '.'));
  const stepValid = Number.isFinite(parsedStep) && parsedStep > 0;

  function submit() {
    if (!nameValid || !stepValid) return;
    onSave({
      name,
      zone,
      videoLinks,
      isBodyweight,
      equipmentWeightStep: parsedStep,
      notes,
    });
  }

  return (
    <section className="catalog">
      <header className="catalog__header">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={onCancel}>
          <ChevronLeft aria-hidden />
        </button>
        <h1 className="catalog__title">{exercise ? 'Редактор упражнения' : 'Новое упражнение'}</h1>
      </header>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span className="field__label">Название</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Жим гантелей лёжа 30°"
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">Зона</span>
          <input
            className="input"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            list={zonesListId}
            placeholder="Грудь, Спина, Ноги…"
          />
          <datalist id={zonesListId}>
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>

        <fieldset className="field">
          <span className="field__label">Ссылки на видео</span>
          {videoLinks.map((link, i) => (
            <div className="field__row" key={i}>
              <input
                className="input"
                type="url"
                value={link}
                onChange={(e) => setVideoLinks(replaceAt(videoLinks, i, e.target.value))}
                placeholder="https://…"
              />
              <button
                type="button"
                className="icon-btn"
                aria-label="Удалить ссылку"
                onClick={() => setVideoLinks(removeAt(videoLinks, i))}
              >
                <X aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setVideoLinks([...videoLinks, ''])}
          >
            <Plus aria-hidden /> Добавить ссылку
          </button>
        </fieldset>

        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={isBodyweight}
            onChange={(e) => setIsBodyweight(e.target.checked)}
          />
          <span className="field__label">Вес тела</span>
        </label>

        <label className="field">
          <span className="field__label">Шаг веса снаряда, кг</span>
          <input
            className="input"
            type="number"
            min="0"
            step="0.25"
            inputMode="decimal"
            value={weightStep}
            onChange={(e) => setWeightStep(e.target.value)}
          />
          {!stepValid ? <span className="field__error">Введите число больше нуля</span> : null}
        </label>

        <label className="field">
          <span className="field__label">Заметки</span>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={!nameValid || !stepValid}>
            Сохранить
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </form>

      {progress ? <div className="catalog__progress">{progress}</div> : null}
    </section>
  );
}

function replaceAt(list: string[], index: number, value: string): string[] {
  return list.map((v, i) => (i === index ? value : v));
}

function removeAt(list: string[], index: number): string[] {
  return list.filter((_, i) => i !== index);
}
