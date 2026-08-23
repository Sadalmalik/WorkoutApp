/**
 * Import/export subsystem barrel (ticket 11 exports; ticket 12 adds `import.ts` alongside).
 */

export type {
  ExportKind,
  ExportEnvelope,
  FullExport,
  ProgramShareExport,
  ExportDocument,
} from './export.ts';
export {
  exportFull,
  exportProgramShare,
  collectExerciseIds,
  collectMuscleIds,
  exportToJson,
} from './export.ts';

export type {
  NamedKind,
  DedupDecision,
  DedupItem,
  DedupDecisions,
  DiffStatus,
  MergePolicy,
  DiffItem,
  ImportDiff,
  MergePolicies,
} from './import.ts';
export {
  ImportError,
  parseImportDocument,
  collectDedupItems,
  buildImportDiff,
  defaultMergePolicies,
  applyImport,
  runImport,
} from './import.ts';
