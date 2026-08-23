import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Clock, Storage, SaveData } from '../core/index.ts';
import { emptySaveData, SystemClock } from '../core/index.ts';
import {
  ROUTES,
  useRoute,
  useHash,
  parseCatalogRoute,
  parseProgramRoute,
  type Route,
} from './router.ts';
import { useTheme } from './theme.ts';
import { BottomNav } from './nav/BottomNav.tsx';
import { BodyweightDialog } from './components/BodyweightDialog.tsx';
import {
  HomeScreen,
  ResultsScreen,
  SettingsScreen,
  BodyweightScreen,
  AdHocScreen,
} from './screens/index.tsx';
import { CatalogView } from './screens/CatalogView.tsx';
import { ProgramsView } from './screens/ProgramsView.tsx';

const SCREENS: Record<Route, () => ReactElement> = {
  [ROUTES.home]: HomeScreen,
  [ROUTES.results]: ResultsScreen,
  [ROUTES.settings]: SettingsScreen,
  [ROUTES.bodyweight]: BodyweightScreen,
  [ROUTES.adhoc]: AdHocScreen,
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
  const route = useRoute();
  const hash = useHash();
  useTheme(save.settings.theme);

  // Re-read the persisted save after a core mutation so views reflect the change.
  const reload = useCallback(() => setSave(storage.load() ?? emptySaveData()), [storage]);

  const catalog = parseCatalogRoute(hash);
  const programs = parseProgramRoute(hash);
  const Screen = useMemo(() => SCREENS[route], [route]);

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
        ) : (
          <Screen />
        )}
      </main>
      {/* The catalog and program areas live under Settings, so keep that tab highlighted inside them. */}
      <BottomNav
        active={catalog || programs ? ROUTES.settings : route}
        onBodyweight={() => setBodyweightOpen(true)}
      />
      {bodyweightOpen ? (
        <BodyweightDialog
          storage={storage}
          clock={clock}
          onClose={() => setBodyweightOpen(false)}
          onSaved={() => setSave(storage.load() ?? emptySaveData())}
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
