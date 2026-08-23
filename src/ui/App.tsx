import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Clock, Storage, SaveData } from '../core/index.ts';
import { emptySaveData, SystemClock } from '../core/index.ts';
import { ROUTES, useRoute, type Route } from './router.ts';
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
  useTheme(save.settings.theme);

  const Screen = useMemo(() => SCREENS[route], [route]);

  return (
    <div className="app">
      <main className="app__body">
        <Screen />
      </main>
      <BottomNav active={route} onBodyweight={() => setBodyweightOpen(true)} />
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
