import { useRef } from 'react';
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

/** Max gap (ms) between two Home taps to count as a double-tap. */
const DOUBLE_TAP_MS = 350;

export function BottomNav({
  active,
  onBodyweight,
  onHomeDoubleTap,
}: {
  active: Route;
  /** Opens the bodyweight-log popup; when given, the "feather" item calls it instead of routing. */
  onBodyweight?: () => void;
  /** Called on a double-tap of the Home item (opens the active-program popup). */
  onHomeDoubleTap?: () => void;
}) {
  const lastHomeTap = useRef(0);

  function tapHome() {
    const now = Date.now();
    if (onHomeDoubleTap !== undefined && now - lastHomeTap.current < DOUBLE_TAP_MS) {
      lastHomeTap.current = 0;
      onHomeDoubleTap();
      return;
    }
    lastHomeTap.current = now;
    navigate(ROUTES.home);
  }

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {ITEMS.map(({ route, label, Icon }) => {
        const isActive = active === route;
        const opensPopup = route === ROUTES.bodyweight && onBodyweight !== undefined;
        const isHome = route === ROUTES.home;
        return (
          <button
            key={route}
            type="button"
            className="bottom-nav__item"
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            aria-haspopup={opensPopup ? 'dialog' : undefined}
            data-active={isActive || undefined}
            onClick={() => {
              if (opensPopup) onBodyweight!();
              else if (isHome) tapHome();
              else navigate(route);
            }}
          >
            <Icon className="bottom-nav__icon" aria-hidden />
            <span className="bottom-nav__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
