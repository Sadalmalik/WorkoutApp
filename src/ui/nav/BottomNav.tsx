import { Settings, LineChart, Home, Feather, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTES, navigate, type Route } from '../router.ts';

/** Bottom navigation, left to right: Settings · Results · Home · Bodyweight · Ad-hoc ("+"). */
const ITEMS: ReadonlyArray<{ route: Route; label: string; Icon: LucideIcon }> = [
  { route: ROUTES.settings, label: 'Settings', Icon: Settings },
  { route: ROUTES.results, label: 'Results', Icon: LineChart },
  { route: ROUTES.home, label: 'Home', Icon: Home },
  { route: ROUTES.bodyweight, label: 'Bodyweight', Icon: Feather },
  { route: ROUTES.adhoc, label: 'Add', Icon: Plus },
];

export function BottomNav({ active }: { active: Route }) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {ITEMS.map(({ route, label, Icon }) => {
        const isActive = active === route;
        return (
          <button
            key={route}
            type="button"
            className="bottom-nav__item"
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            data-active={isActive || undefined}
            onClick={() => navigate(route)}
          >
            <Icon className="bottom-nav__icon" aria-hidden />
            <span className="bottom-nav__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
