import React, { useState, useEffect, useMemo } from 'react';
import { Settings, Dumbbell, ExternalLink, List, X } from 'lucide-react';
import Timer from './components/Timer';
import SetLogger from './components/SetLogger';
import { fetchSheetData, writeResult } from './services/googleSheetsService';
import { AppState, ExerciseDefinition, ScheduledExercise, SheetConfig, WorkoutResult } from './types';

// Constants
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const App: React.FC = () => {
  // --- State ---
  const [config, setConfig] = useState<SheetConfig>({
    spreadsheetId: localStorage.getItem('sheetId') || '',
    apiKey: localStorage.getItem('apiKey') || ''
  });
  
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  // Data
  const [definitions, setDefinitions] = useState<Map<string, ExerciseDefinition>>(new Map());
  const [dailyQueue, setDailyQueue] = useState<ScheduledExercise[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);
  
  // Manual override
  const [manualExercise, setManualExercise] = useState<ScheduledExercise | null>(null);
  
  // Current session data
  const [currentSets, setCurrentSets] = useState<{weight: number, reps: number}[]>([]);
  
  // UI State
  const [showSettings, setShowSettings] = useState(false);
  const [showExerciseSelector, setShowExerciseSelector] = useState(false);
  const [filterText, setFilterText] = useState('');

  // --- Effects ---

  // Initial load
  useEffect(() => {
    if (config.spreadsheetId && config.apiKey) {
      loadData();
    } else {
      setShowSettings(true);
    }
  }, []);

  // Compute derived state for display
  const today = new Date();
  const todayWeekday = WEEKDAYS[today.getDay()];
  
  // The active exercise is either the manual override OR the current one in the queue
  const activeExercise: ScheduledExercise | null = manualExercise 
    ? manualExercise 
    : (dailyQueue.length > 0 && currentQueueIndex < dailyQueue.length) 
      ? dailyQueue[currentQueueIndex] 
      : null;

  const activeDefinition = activeExercise && definitions.has(activeExercise.name) 
    ? definitions.get(activeExercise.name) 
    : null;

  const isWorkoutCompleted = !manualExercise && currentQueueIndex >= dailyQueue.length && dailyQueue.length > 0;
  const isRestDay = !manualExercise && dailyQueue.length === 0 && appState === AppState.WORKOUT;

  // --- Logic ---

  const loadData = async () => {
    setAppState(AppState.LOADING);
    setErrorMessage('');
    try {
      const data = await fetchSheetData(config);
      setDefinitions(data.definitions);
      
      const todaysProgram = data.program.get(todayWeekday) || [];
      setDailyQueue(todaysProgram);
      setAppState(AppState.WORKOUT);
    } catch (err: any) {
      setAppState(AppState.ERROR);
      setErrorMessage(err.message || "Unknown error");
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('sheetId', config.spreadsheetId);
    localStorage.setItem('apiKey', config.apiKey);
    setShowSettings(false);
    loadData();
  };

  const handleManualSelect = (exName: string) => {
    // Create a generic scheduled exercise from the definition
    const def = definitions.get(exName);
    const newEx: ScheduledExercise = {
      name: exName,
      sets: 3, // Default
      recWeight: 0,
      recReps: 0
    };
    setManualExercise(newEx);
    setCurrentSets([]); // Clear current progress
    setShowExerciseSelector(false);
  };

  const handleSubmit = async () => {
    if (!activeExercise) return;

    setAppState(AppState.LOADING);

    // 1. Write to Sheet
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Process each set sequentially
    for (let i = 0; i < currentSets.length; i++) {
      const set = currentSets[i];
      const result: WorkoutResult = {
        date: dateStr,
        weekday: todayWeekday,
        setNumber: i + 1,
        exerciseName: activeExercise.name,
        recWeight: activeExercise.recWeight,
        recReps: activeExercise.recReps,
        actWeight: set.weight,
        actReps: set.reps
      };
      
      // We don't block the UI strictly on failure since we can't guarantee auth 
      // in this simplified public-api context, but we try.
      await writeResult(config, result);
    }

    // 2. Logic Update
    setCurrentSets([]); // Clear table

    if (manualExercise) {
      // If we finished a manual exercise, go back to the queue (or completed state)
      setManualExercise(null);
    } else {
      // Advance the queue
      setCurrentQueueIndex(prev => prev + 1);
    }

    setAppState(AppState.WORKOUT);
  };

  // --- Render Helpers ---

  if (showSettings) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col p-6">
        <h2 className="text-2xl font-bold mb-4">Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Google Sheet ID</label>
            <input 
              type="text" 
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              value={config.spreadsheetId}
              onChange={e => setConfig({...config, spreadsheetId: e.target.value})}
              placeholder="e.g. 1BxiMVs0XRA5nFMdKbBdBwjcn..."
            />
            <p className="text-xs text-gray-500 mt-1">Found in the URL of your Google Sheet.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">API Key</label>
            <input 
              type="text" 
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              value={config.apiKey}
              onChange={e => setConfig({...config, apiKey: e.target.value})}
              placeholder="AIzaSy..."
            />
            <p className="text-xs text-gray-500 mt-1">Required to read the public sheet.</p>
          </div>
          <button 
            onClick={handleSaveSettings}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold"
          >
            Save & Load
          </button>
          {/* Close button if we already have data loaded */}
          {appState !== AppState.IDLE && (
            <button 
               onClick={() => setShowSettings(false)}
               className="w-full text-gray-600 p-3"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  if (showExerciseSelector) {
    const allExercises: ExerciseDefinition[] = Array.from(definitions.values());
    const filtered = allExercises.filter(e => e.name.toLowerCase().includes(filterText.toLowerCase()));

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <input 
            autoFocus
            type="text" 
            placeholder="Search exercises..." 
            className="flex-1 bg-white border rounded p-2 mr-4"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
          <button onClick={() => setShowExerciseSelector(false)}>
            <X size={24} className="text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((ex: ExerciseDefinition) => (
            <div 
              key={ex.name} 
              onClick={() => handleManualSelect(ex.name)}
              className="p-4 border-b hover:bg-blue-50 cursor-pointer"
            >
              <div className="font-bold">{ex.name}</div>
              <div className="text-sm text-gray-500">{ex.muscleGroup}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      
      {/* Top Control Panel */}
      <div className="flex justify-between items-center p-4 bg-white shadow-sm z-10">
        <button 
          onClick={() => setShowExerciseSelector(true)}
          className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
        >
          <List size={24} className="text-gray-700" />
        </button>
        <h1 className="text-sm font-bold text-blue-600">FitSheet Tracker</h1>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
        >
          <Settings size={24} className="text-gray-700" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-6">
        
        {/* State: Loading */}
        {appState === AppState.LOADING && (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* State: Error */}
        {appState === AppState.ERROR && (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="text-red-500 font-bold mb-2">Error</div>
            <p>{errorMessage}</p>
            <button onClick={() => setShowSettings(true)} className="mt-4 text-blue-600 underline">Check Settings</button>
          </div>
        )}

        {/* State: Workout Active */}
        {appState === AppState.WORKOUT && (
          <>
            {isRestDay ? (
               <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Dumbbell size={48} className="mb-4 opacity-20" />
                  <h2 className="text-2xl font-bold">день отдыха</h2>
                  <p className="mt-2 text-sm">Or select an exercise manually</p>
               </div>
            ) : isWorkoutCompleted ? (
              <div className="flex flex-col items-center justify-center h-full text-green-600">
                  <div className="bg-green-100 p-6 rounded-full mb-4">
                    <Dumbbell size={48} />
                  </div>
                  <h2 className="text-2xl font-bold">Workout completed</h2>
                  <p className="mt-2 text-sm text-gray-500">Good job! Select manually to do more.</p>
               </div>
            ) : activeExercise && (
              <div className="flex flex-col space-y-4">
                
                {/* Header Info */}
                <div className="bg-white p-4 border-b">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    {today.toLocaleDateString()} • {todayWeekday}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 leading-tight mt-1">
                    {activeExercise.name}
                  </h2>
                  {/* Metadata */}
                  <div className="flex flex-wrap gap-2 mt-2">
                     <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                       {activeDefinition?.muscleGroup || 'General'}
                     </span>
                     <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                       {activeExercise.sets} Sets Recommended
                     </span>
                  </div>
                   {/* Video Links */}
                   {activeDefinition?.videoLinks && activeDefinition.videoLinks.length > 0 && (
                     <div className="mt-3 flex gap-2">
                       {activeDefinition.videoLinks.map((link, idx) => (
                         <a 
                            key={idx} 
                            href={link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center text-xs text-blue-600 hover:underline"
                          >
                           <ExternalLink size={12} className="mr-1" />
                           Video {idx + 1}
                         </a>
                       ))}
                     </div>
                   )}
                </div>

                {/* Timer */}
                <Timer />

                {/* Set Logger */}
                <SetLogger 
                  exercise={activeExercise} 
                  currentSets={currentSets}
                  onSetsChanged={setCurrentSets}
                />

                {/* Submit Area */}
                <div className="p-4">
                  <button
                    onClick={handleSubmit}
                    className="w-full bg-blue-600 text-white text-lg font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    Submit Exercise
                  </button>
                  <p className="text-center text-xs text-gray-400 mt-2">
                    Writes to "Results" tab and loads next exercise
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default App;