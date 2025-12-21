// Data model for an exercise definition (From "Exercise List" tab)
export interface ExerciseDefinition {
  name: string;
  muscleGroup: string;
  videoLinks: string[];
}

// Data model for a scheduled exercise (From "Workout Program" tab)
export interface ScheduledExercise {
  name: string;
  sets: number;
  recWeight: number;
  recReps: number;
}

// Data model for a performed set (For "Results" tab)
export interface WorkoutResult {
  date: string;
  weekday: string;
  setNumber: number;
  exerciseName: string;
  recWeight: number;
  recReps: number;
  actWeight: number;
  actReps: number;
}

// Configuration for Google Sheets connection
export interface SheetConfig {
  spreadsheetId: string;
  apiKey: string;
}

// Internal app state for the current workflow
export enum AppState {
  LOADING,
  IDLE,
  WORKOUT,
  COMPLETED,
  ERROR
}