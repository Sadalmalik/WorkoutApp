import { StubScreen } from './StubScreen.tsx';

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
  return <StubScreen title="Settings" note="Catalogs, programs, theme & accessibility — tickets 02/03/05/12." />;
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
