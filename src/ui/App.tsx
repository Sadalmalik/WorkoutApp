import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import type { Clock, Storage, SaveData } from '../core/index.ts';
import { emptySaveData, SystemClock } from '../core/index.ts';
import {
  ROUTES,
  useRoute,
  useHash,
  parseCatalogRoute,
  parseProgramRoute,
  isSessionRoute,
  type Route,
} from './router.ts';
import { useTheme } from './theme.ts';
import { BottomNav } from './nav/BottomNav.tsx';
import { BodyweightDialog } from './components/BodyweightDialog.tsx';
import { ProgramPopup } from './components/ProgramPopup.tsx';
import { ResultsScreen, SettingsScreen, BodyweightScreen } from './screens/index.tsx';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { SessionScreen } from './screens/SessionScreen.tsx';
import { AdHocScreen } from './screens/AdHocScreen.tsx';
import { CatalogView } from './screens/CatalogView.tsx';
import { ProgramsView } from './screens/ProgramsView.tsx';

/** Screens that need no core wiring (Home/Session/Ad-hoc are handled specially below). */
const STUB_SCREENS: Record<
  Exclude<Route, typeof ROUTES.home | typeof ROUTES.adhoc | typeof ROUTES.settings>,
  () => ReactElement
> = {
  [ROUTES.results]: ResultsScreen,
  [ROUTES.bodyweight]: BodyweightScreen,
};

/**
 * Root React shell: loads the save through the injected {@link Storage} port, applies the theme
 * from settings, and renders the routed stub screen above the bottom navigation.
 */
export function App({
  storage,
  clock = new SystemClock(),
}: {
  storage: Storage;
  clock?: Clock;
}) {
  const [save, setSave] = useState<SaveData>(() => storage.load() ?? seedEmpty(storage));
  const [bodyweightOpen, setBodyweightOpen] = useState(false);
  const [programPopupOpen, setProgramPopupOpen] = useState(false);
  const route = useRoute();
  const hash = useHash();
  useTheme(save.settings.theme);

  // Re-read the persisted save after a core mutation so views reflect the change.
  const reload = useCallback(() => setSave(storage.load() ?? emptySaveData()), [storage]);

  const catalog = parseCatalogRoute(hash);
  const programs = parseProgramRoute(hash);
  const session = isSessionRoute(hash);
  const StubScreen =
    route === ROUTES.home || route === ROUTES.adhoc || route === ROUTES.settings
      ? null
      : STUB_SCREENS[route];

  const activeProgram = save.activeProgram;
  const activeProgramEntity = activeProgram
    ? save.programs.find((p) => p.id === activeProgram.programId) ?? null
    : null;

  return (
    <div className="app">
      <main className="app__body">
        {catalog ? (
          <CatalogView storage={storage} exercises={save.exercises} onChange={reload} />
        ) : programs ? (
          <ProgramsView
            storage={storage}
            programs={save.programs}
            exercises={save.exercises}
            onChange={reload}
          />
        ) : session ? (
          <SessionScreen storage={storage} clock={clock} save={save} onChange={reload} />
        ) : route === ROUTES.adhoc ? (
          <AdHocScreen
            storage={storage}
            clock={clock}
            exercises={save.exercises}
            onChange={reload}
          />
        ) : route === ROUTES.settings ? (
          <SettingsScreen save={save} clock={clock} />
        ) : StubScreen ? (
          <StubScreen />
        ) : (
          <HomeScreen save={save} storage={storage} clock={clock} onChange={reload} />
        )}
      </main>
      {/* The catalog and program areas live under Settings, so keep that tab highlighted inside them. */}
      <BottomNav
        active={catalog || programs ? ROUTES.settings : session ? ROUTES.home : route}
        onBodyweight={() => setBodyweightOpen(true)}
        onHomeDoubleTap={
          activeProgram && activeProgramEntity ? () => setProgramPopupOpen(true) : undefined
        }
      />
      {bodyweightOpen ? (
        <BodyweightDialog
          storage={storage}
          clock={clock}
          onClose={() => setBodyweightOpen(false)}
          onSaved={reload}
        />
      ) : null}
      {programPopupOpen && activeProgram && activeProgramEntity ? (
        <ProgramPopup
          storage={storage}
          clock={clock}
          program={activeProgramEntity}
          active={activeProgram}
          onChange={reload}
          onClose={() => setProgramPopupOpen(false)}
        />
      ) : null}
    </div>
  );
}

function seedEmpty(storage: Storage): SaveData {
  const data = emptySaveData();
  storage.save(data);
  return data;
}
