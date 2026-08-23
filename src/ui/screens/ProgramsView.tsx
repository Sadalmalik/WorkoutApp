import type { Storage, Exercise, Program } from '../../core/index.ts';
import { newProgram, createProgram, updateProgram } from '../../core/index.ts';
import {
  parseProgramRoute,
  navigateToPrograms,
  navigateToProgram,
  navigate,
  ROUTES,
  useHash,
} from '../router.ts';
import { ProgramListScreen } from './ProgramListScreen.tsx';
import { ProgramEditorScreen } from './ProgramEditorScreen.tsx';

/**
 * Container for the program area (`#/programs` and `#/programs/<id>`). Reads the sub-route from
 * the hash and renders either the list or the linear editor, wiring UI events to the core program
 * operations through the injected {@link Storage} port. After any mutation it calls `onChange` so
 * the parent re-reads the save.
 *
 * Creation flow mirrors the catalog: the list creates a blank program (one 3-day plan) with the
 * entered name, persists it, and jumps straight into the editor for its id.
 */
export function ProgramsView({
  storage,
  programs,
  exercises,
  onChange,
}: {
  storage: Storage;
  programs: Program[];
  exercises: Exercise[];
  onChange: () => void;
}) {
  const hash = useHash();
  const route = parseProgramRoute(hash) ?? { kind: 'list' };

  if (route.kind === 'editor') {
    const existing = programs.find((p) => p.id === route.id);
    // Stale/unknown id (e.g. a deep link to a deleted program): fall back to the list.
    if (existing === undefined) {
      navigateToPrograms();
      return null;
    }

    return (
      <ProgramEditorScreen
        program={existing}
        exercises={exercises}
        onSave={(program) => {
          updateProgram(storage, program);
          onChange();
          navigateToPrograms();
        }}
        onCancel={navigateToPrograms}
      />
    );
  }

  return (
    <ProgramListScreen
      programs={programs}
      onOpen={navigateToProgram}
      onCreate={(name) => {
        const created = createProgram(storage, newProgram(name, { planLength: 3 }));
        onChange();
        navigateToProgram(created.id);
      }}
      onBack={() => navigate(ROUTES.settings)}
    />
  );
}
