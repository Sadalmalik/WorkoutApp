import { ChevronRight } from 'lucide-react';
import { StubScreen } from './StubScreen.tsx';
import { navigateToCatalog } from '../router.ts';

/**
 * Stub screens for the five shell routes. Each is a labelled placeholder that later tickets
 * replace with the real Home state machine, statistics, catalogs/settings, bodyweight logging,
 * and the ad-hoc exercise flow.
 */

export function HomeScreen() {
  return <StubScreen title="Home" note="Today's workout / program state — ticket 06/07." />;
}

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
      </nav>
      <p className="screen__note">Программы, тема и доступность — тикеты 03/05/12.</p>
    </section>
  );
}

export function BodyweightScreen() {
  return <StubScreen title="Bodyweight" note="Log bodyweight — later ticket." />;
}

export function AdHocScreen() {
  return <StubScreen title="Ad-hoc exercise" note="Off-plan exercise flow — later ticket." />;
}
