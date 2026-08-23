import type { Storage, Exercise, ExerciseDraft } from '../../core/index.ts';
import { createExercise, updateExercise, collectZones } from '../../core/index.ts';
import {
  parseCatalogRoute,
  navigateToCatalog,
  navigateToExercise,
  navigate,
  ROUTES,
  useHash,
  EXERCISE_NEW,
} from '../router.ts';
import { ExerciseListScreen } from './ExerciseListScreen.tsx';
import { ExerciseEditorScreen } from './ExerciseEditorScreen.tsx';

/**
 * Container for the exercise-catalog area (`#/exercises` and `#/exercises/<id>`). Reads the
 * catalog sub-route from the hash and renders either the list or the editor, wiring UI events to
 * the core catalog operations through the injected {@link Storage} port. After any mutation it
 * calls `onChange` so the parent re-reads the save and the list reflects the edit.
 */
export function CatalogView({
  storage,
  exercises,
  onChange,
}: {
  storage: Storage;
  exercises: Exercise[];
  onChange: () => void;
}) {
  const hash = useHash();
  const route = parseCatalogRoute(hash) ?? { kind: 'list' };

  if (route.kind === 'editor') {
    const existing =
      route.id === EXERCISE_NEW ? undefined : exercises.find((e) => e.id === route.id);

    // Stale/unknown id (e.g. a deep link to a deleted exercise): fall back to the list.
    if (route.id !== EXERCISE_NEW && existing === undefined) {
      navigateToCatalog();
      return null;
    }

    return (
      <ExerciseEditorScreen
        exercise={existing}
        zones={collectZones(exercises)}
        onSave={(draft: ExerciseDraft) => {
          if (existing) updateExercise(storage, existing.id, draft);
          else createExercise(storage, draft);
          onChange();
          navigateToCatalog();
        }}
        onCancel={navigateToCatalog}
      />
    );
  }

  return (
    <ExerciseListScreen
      exercises={exercises}
      onOpen={navigateToExercise}
      onCreate={(name: string) => {
        const created = createExercise(storage, { name });
        onChange();
        navigateToExercise(created.id);
      }}
      onBack={() => navigate(ROUTES.settings)}
    />
  );
}
