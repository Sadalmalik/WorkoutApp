import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Storage, SaveData } from '../core/index.ts';
import { emptySaveData } from '../core/index.ts';
import { ROUTES, useRoute, useHash, parseCatalogRoute, type Route } from './router.ts';
import { useTheme } from './theme.ts';
import { BottomNav } from './nav/BottomNav.tsx';
import {
  HomeScreen,
  ResultsScreen,
  SettingsScreen,
  BodyweightScreen,
  AdHocScreen,
} from './screens/index.tsx';
import { CatalogView } from './screens/CatalogView.tsx';

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
export function App({ storage }: { storage: Storage }) {
  const [save, setSave] = useState<SaveData>(() => storage.load() ?? seedEmpty(storage));
  const route = useRoute();
  const hash = useHash();
  useTheme(save.settings.theme);

  // Re-read the persisted save after a core mutation so views reflect the change.
  const reload = useCallback(() => setSave(storage.load() ?? emptySaveData()), [storage]);

  const catalog = parseCatalogRoute(hash);
  const Screen = useMemo(() => SCREENS[route], [route]);

  return (
    <div className="app">
      <main className="app__body">
        {catalog ? (
          <CatalogView storage={storage} exercises={save.exercises} onChange={reload} />
        ) : (
          <Screen />
        )}
      </main>
      {/* The catalog lives under Settings, so keep that tab highlighted while inside it. */}
      <BottomNav active={catalog ? ROUTES.settings : route} />
    </div>
  );
}

function seedEmpty(storage: Storage): SaveData {
  const data = emptySaveData();
  storage.save(data);
  return data;
}
