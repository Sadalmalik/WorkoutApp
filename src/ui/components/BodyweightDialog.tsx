import { useEffect, useRef, useState } from 'react';
import type { Clock, Storage } from '../../core/index.ts';
import { addBodyweightEntry } from '../../core/index.ts';

/**
 * Modal popup for the "Лог веса тела": a single weight (kg) input opened from the "feather"
 * bottom-nav button. Saving records one {@link addBodyweightEntry} with the current time from
 * the injected {@link Clock} and closes.
 *
 * The core owns validation (finite, > 0); this dialog mirrors it to gate the Save button and
 * surface an inline message, but never invents its own time or id.
 */
export function BodyweightDialog({
  storage,
  clock,
  onClose,
  onSaved,
}: {
  storage: Storage;
  clock: Clock;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const weight = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(weight) && weight > 0;

  function save() {
    if (!valid) return;
    addBodyweightEntry(storage, clock, weight);
    onSaved?.();
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bw-dialog-title"
      >
        <h2 id="bw-dialog-title" className="modal__title">
          Вес тела
        </h2>
        <form
          className="modal__form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="modal__field">
            <span className="modal__label">Вес, кг</span>
            <input
              ref={inputRef}
              className="modal__input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="напр. 82.5"
            />
          </label>
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn--primary" disabled={!valid}>
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
