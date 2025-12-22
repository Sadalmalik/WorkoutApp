import { ExerciseDefinition, ScheduledExercise, SheetConfig, WorkoutResult } from '../types';

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Fetches the raw data from the sheet
 */
export const fetchSheetData = async (config: SheetConfig) => {
  if (!config.spreadsheetId || !config.apiKey) {
    throw new Error("Missing configuration");
  }

  // Batch get both Exercise List and Workout Program
  // Exercise List: Column A to C
  // Workout Program: Column A to D
  // We fetch the entire columns to ensure we get all data, then skip the header in parsing.
  const ranges = [
    "'Exercise List'!A:D", 
    "'Workout Program'!A:D"
  ];
  
  const url = `${BASE_URL}/${config.spreadsheetId}/values:batchGet?key=${config.apiKey}&ranges=${ranges.join('&ranges=')}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("нет доступа к таблице");
  }

  const data = await response.json();
  return parseSheetData(data);
};

/**
 * Parses the raw API response into usable objects
 */
const parseSheetData = (data: any) => {
  const valueRanges = data.valueRanges;
  
  // 1. Parse Exercise List
  // Skip the first row (Header)
  const rawExerciseRows = valueRanges[0].values || [];
  const exerciseRows = rawExerciseRows.slice(1); 
  
  const exerciseDefinitions = new Map<string, ExerciseDefinition>();
  
  // Columns in Exercise list:
  // A - internal table ID
  // B - Exercise name
  // C - Muscle Group
  // D - Video Links
  exerciseRows.forEach((row: string[]) => {
    if (row[1]) {
      exerciseDefinitions.set(row[1], {
        name: row[1],
        muscleGroup: row[2] || '',
        videoLinks: row[3] ? row[3].split(',').map(s => s.trim()) : []
      });
    }
  });

  // 2. Parse Workout Program
  // Skip the first row (Header)
  const rawProgramRows = valueRanges[1].values || [];
  const programRows = rawProgramRows.slice(1);
  
  // Structure: 8 rows per day, Mon-Sun.
  // We expect blocks of 8 rows. 
  // Mon: Index 0-7, Tue: 8-15, ... Sun: 48-55
  
  const programByDay = new Map<string, ScheduledExercise[]>();
  
  // Shift mapping: JS Sunday is 0, Sheet Monday is first block.
  // Let's map JS day index (0-6) to Sheet Block Index (0-6).
  // Sheet: Mon(0), Tue(1)... Sun(6)
  // JS: Sun(0), Mon(1)... Sat(6)
  
  const jsDayToSheetBlockIndex = [6, 0, 1, 2, 3, 4, 5]; // Sun -> 6 (last block), Mon -> 0 (first block)
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  for (let d = 0; d < 7; d++) {
    const blockIndex = jsDayToSheetBlockIndex[d];
    const startIndex = blockIndex * 8;
    const dayExercises: ScheduledExercise[] = [];
    
    for (let i = 0; i < 8; i++) {
      const row = programRows[startIndex + i];
      if (row && row[0]) { // If exercise name exists
        dayExercises.push({
          name: row[0],
          sets: parseInt(row[1] || '3', 10),
          recWeight: parseFloat(row[2] || '0'),
          recReps: parseFloat(row[3] || '0')
        });
      }
    }
    programByDay.set(dayNames[d], dayExercises);
  }

  return {
    definitions: exerciseDefinitions,
    program: programByDay
  };
};

/**
 * Submits a result to Google Forms
 */
export const submitToGoogleForm = async (config: SheetConfig, result: WorkoutResult) => {
  if (!config.googleFormId || !config.fieldMapping) {
    console.warn("Missing Google Form configuration");
    return false;
  }

  const formUrl = `https://docs.google.com/forms/u/0/d/e/${config.googleFormId}/formResponse`;
  const formData = new FormData();

  // Map fields to form entries
  // Iterate over the keys of the result object
  (Object.keys(result) as Array<keyof WorkoutResult>).forEach((key) => {
    const entryId = config.fieldMapping[key];
    if (entryId) {
      formData.append(entryId, String(result[key]));
    }
  });

  try {
    // Google Forms submission needs mode: 'no-cors' when called from browser
    // The response will be opaque (status 0), but the submission succeeds if URL/IDs are correct.
    await fetch(formUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });
    return true;
  } catch (e) {
    console.error("Form submission failed", e);
    return false;
  }
};