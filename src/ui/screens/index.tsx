import { ChevronRight, Download, Share2 } from 'lucide-react';
import type { Clock, Storage, SaveData, ExportDocument } from '../../core/index.ts';
import { exportFull, exportProgramShare, exportToJson } from '../../core/index.ts';
import { StubScreen } from './StubScreen.tsx';
import { ImportFlow } from './ImportFlow.tsx';
import { navigateToCatalog, navigateToPrograms } from '../router.ts';

/**
 * Stub screens for the remaining shell routes. Each is a labelled placeholder that later tickets
 * replace with statistics, bodyweight logging, and the ad-hoc exercise flow. Home is the real
 * state machine (ticket 04), exported from {@link ./HomeScreen.tsx}.
 */

export { HomeScreen } from './HomeScreen.tsx';

export function SettingsScreen({
  save,
  clock,
  storage,
  onChange,
}: {
  save: SaveData;
  clock: Clock;
  storage: Storage;
  onChange: () => void;
}) {
  function download(doc: ExportDocument, prefix: string) {
    downloadJson(`${prefix}-${fileStamp(doc.exportedAt)}.json`, exportToJson(doc));
  }

  return (
    <section className="settings">
      <h1 className="settings__title">Настройки</h1>
      <nav className="settings__list" aria-label="Разделы настроек">
        <button type="button" className="settings__row" onClick={navigateToCatalog}>
          <span>Каталог упражнений</span>
          <ChevronRight aria-hidden />
        </button>
        <button type="button" className="settings__row" onClick={navigateToPrograms}>
          <span>Программы</span>
          <ChevronRight aria-hidden />
        </button>
      </nav>

      <h2 className="settings__section-title">Экспорт данных</h2>
      <div className="settings__export" aria-label="Экспорт данных">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => download(exportFull(save, clock.now()), 'workout-backup')}
        >
          <Download aria-hidden /> Полный экспорт
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => download(exportProgramShare(save, clock.now()), 'workout-programs')}
        >
          <Share2 aria-hidden /> Программы и упражнения
        </button>
      </div>
      <p className="screen__note">
        Полный экспорт — резервная копия всех данных. «Программы и упражнения» — для обмена
        с друзьями (без результатов, веса тела и настроек).
      </p>

      <h2 className="settings__section-title">Импорт данных</h2>
      <ImportFlow storage={storage} save={save} onImported={onChange} />
      <p className="screen__note">
        Импорт без затирания: сначала вопросы о совпадениях по имени, затем сводка изменений
        с выбором политики. Результаты и вес тела объединяются, настройки берутся из файла.
        «Импорт из v1 (CSV)» — перенос упражнений и (опционально) истории из выгрузок таблицы v1
        через тот же мастер дедупликации.
      </p>

      <p className="screen__note">Тема и доступность — тикеты 05/12.</p>
    </section>
  );
}

/** `YYYY-MM-DD` stamp (local time) for the export filename. */
function fileStamp(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Hand `text` to the browser as a downloadable `.json` file. Lives in the UI layer (touches the
 * DOM/Blob), so the core export stays pure.
 */
function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BodyweightScreen() {
  return (
    <StubScreen
      title="Bodyweight"
      note="Logging is done from the feather button popup; the bodyweight chart is Phase 2."
    />
  );
}
