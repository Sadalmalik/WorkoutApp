import { ChevronRight } from 'lucide-react';
import { StubScreen } from './StubScreen.tsx';
import { navigateToCatalog, navigateToPrograms } from '../router.ts';

/**
 * Stub screens for the remaining shell routes. Each is a labelled placeholder that later tickets
 * replace with statistics, bodyweight logging, and the ad-hoc exercise flow. Home is the real
 * state machine (ticket 04), exported from {@link ./HomeScreen.tsx}.
 */

export { HomeScreen } from './HomeScreen.tsx';

export function ResultsScreen() {
  return <StubScreen title="Results" note="Progress charts — tickets 09/10." />;
}

export function SettingsScreen() {
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
      <p className="screen__note">Тема и доступность — тикеты 05/12.</p>
    </section>
  );
}

export function BodyweightScreen() {
  return (
    <StubScreen
      title="Bodyweight"
      note="Logging is done from the feather button popup; the bodyweight chart is Phase 2."
    />
  );
}

export function AdHocScreen() {
  return <StubScreen title="Ad-hoc exercise" note="Off-plan exercise flow — later ticket." />;
}
