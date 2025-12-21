import React, { useState, useEffect, useRef } from 'react';
import { Settings, Dumbbell, ExternalLink, List, X, CloudUpload } from 'lucide-react';
import Timer from './components/Timer';
import SetLogger from './components/SetLogger';
import { fetchSheetData, submitToGoogleForm } from './services/googleSheetsService';
import * as QueueService from './services/queueService';
import { AppState, ExerciseDefinition, ScheduledExercise, SheetConfig, WorkoutResult } from './types';

// Constants
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RESULT_FIELDS: (keyof WorkoutResult)[] = [
  'date', 'weekday', 'setNumber', 'exerciseName', 
  'recWeight', 'recReps', 'actWeight', 'actReps'
];

export const App: React.FC = () => {
  // --- State ---
  const [config, setConfig] = useState<SheetConfig>({
    spreadsheetId: localStorage.getItem('sheetId') || '',
    apiKey: localStorage.getItem('apiKey') || '',
    googleFormId: localStorage.getItem('googleFormId') || '',
    fieldMapping: JSON.parse(localStorage.getItem('fieldMapping') || '{}'),
    retryInterval: parseInt(localStorage.getItem('retryInterval') || '5', 10)
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

  // Queue State
  const [queueLength, setQueueLength] = useState<number>(0);
  
  // UI State
  const [showSettings, setShowSettings] = useState(false);
  const [showExerciseSelector, setShowExerciseSelector] = useState(false);
  const [filterText, setFilterText] = useState('');

  // Refs for background processing
  const isProcessingRef = useRef(false);
  const retryTimeoutRef = useRef<number | null>(null);
  const configRef = useRef(config);

  // --- Effects ---

  // Keep config ref updated for background process
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Initial load and queue check
  useEffect(() => {
    // Load initial queue state
    setQueueLength(QueueService.getQueueLength());

    // Start processing if items exist
    processQueue();

    if (config.spreadsheetId && config.apiKey) {
      loadData();
    } else {
      setShowSettings(true);
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  // --- Background Queue Processing ---

  const processQueue = async () => {
    // Prevent concurrent processing
    if (isProcessingRef.current) return;

    // Check if there is anything to process
    let currentQ = QueueService.getQueue();
    if (currentQ.length === 0) return;

    isProcessingRef.current = true;
    console.log(`Starting queue processing. ${currentQ.length} items pending.`);

    try {
      // Loop until queue is empty or a failure occurs
      while (currentQ.length > 0) {
        const item = currentQ[0];
        const success = await submitToGoogleForm(configRef.current, item);

        if (success) {
          console.log("Item submitted successfully.");
          QueueService.dequeue();
          setQueueLength(prev => Math.max(0, prev - 1));
          // Refresh local reference
          currentQ = QueueService.getQueue();
        } else {
          console.warn(`Submission failed. Retrying in ${configRef.current.retryInterval} minutes.`);
          // Stop processing loop
          scheduleRetry();
          return; 
        }
      }
    } finally {
      // Only release lock if we are NOT scheduling a retry (which exits early)
      // Actually, if we return early due to failure, we still need to release lock?
      // No, if we schedule retry, the retry callback will eventually call processQueue again.
      // But we should reset 'isProcessing' so the retry call can enter.
      isProcessingRef.current = false;
    }
  };

  const scheduleRetry = () => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    const intervalMs = (configRef.current.retryInterval || 5) * 60 * 1000;
    
    // @ts-ignore: Window/Node timeout types mismatch
    retryTimeoutRef.current = setTimeout(() => {
      console.log("Retry timer fired. Attempting to process queue.");
      processQueue();
    }, intervalMs);
  };

  // --- Compute derived state ---
  
  const today = new Date();
  const todayWeekday = WEEKDAYS[today.getDay()];
  
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
    localStorage.setItem('googleFormId', config.googleFormId);
    localStorage.setItem('fieldMapping', JSON.stringify(config.fieldMapping));
    localStorage.setItem('retryInterval', config.retryInterval.toString());
    
    setShowSettings(false);
    loadData();
    // Trigger queue process in case settings fixed a previous error
    processQueue();
  };

  const handleManualSelect = (exName: string) => {
    const def = definitions.get(exName);
    const newEx: ScheduledExercise = {
      name: exName,
      sets: 3, 
      recWeight: 0,
      recReps: 0
    };
    setManualExercise(newEx);
    setCurrentSets([]); 
    setShowExerciseSelector(false);
  };

  const handleSubmit = () => {
    if (!activeExercise) return;

    // 1. Enqueue Items Only (No direct submit)
    const dateStr = today.toISOString().split('T')[0]; 
    
    currentSets.forEach((set, i) => {
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
      QueueService.enqueue(result);
    });

    // Update UI count
    setQueueLength(QueueService.getQueueLength());
    
    // Trigger background process (non-blocking)
    processQueue();

    // 2. Logic Update (Advance UI immediately)
    setCurrentSets([]); 

    if (manualExercise) {
      setManualExercise(null);
    } else {
      setCurrentQueueIndex(prev => prev + 1);
    }
  };

  // --- Render Helpers ---

  if (showSettings) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col p-6 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Settings</h2>
        <div className="space-y-6 pb-6">
          
          {/* Google Sheets Config */}
          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold text-gray-900">Google Sheets (Read Only)</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700">Google Sheet ID</label>
              <input 
                type="text" 
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                value={config.spreadsheetId}
                onChange={e => setConfig({...config, spreadsheetId: e.target.value})}
                placeholder="e.g. 1BxiMVs0XRA..."
              />
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
            </div>
          </div>

          {/* Google Forms Config */}
          <div className="space-y-4">
             <h3 className="font-semibold text-gray-900">Google Forms (Submission)</h3>
             <div>
              <label className="block text-sm font-medium text-gray-700">Form ID</label>
              <input 
                type="text" 
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                value={config.googleFormId}
                onChange={e => setConfig({...config, googleFormId: e.target.value})}
                placeholder="e.g. 1FAIpQLSe..."
              />
            </div>
            
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Retry Interval (Minutes)</label>
              <input 
                type="number" 
                min="1"
                className="w-20 border border-gray-300 rounded-md shadow-sm p-2 text-center"
                value={config.retryInterval}
                onChange={e => setConfig({...config, retryInterval: parseInt(e.target.value) || 5})}
              />
            </div>

            <div className="bg-gray-50 p-3 rounded-lg border">
              <div className="text-sm font-medium mb-2 text-gray-700">Field Mapping (entry IDs)</div>
              <p className="text-xs text-gray-500 mb-3">
                Enter the 'entry.XXXX' ID for each field.
              </p>
              <div className="space-y-2">
                {RESULT_FIELDS.map(field => (
                   <div key={field} className="flex items-center justify-between">
                     <span className="text-sm text-gray-700 capitalize w-1/3">{field}</span>
                     <input 
                        type="text" 
                        placeholder="entry.123456"
                        className="flex-1 border border-gray-300 rounded p-1 text-sm"
                        value={config.fieldMapping[field] || ''}
                        onChange={(e) => {
                           const newMapping = { ...config.fieldMapping, [field]: e.target.value };
                           setConfig({ ...config, fieldMapping: newMapping });
                        }}
                     />
                   </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col space-y-3 pt-2">
            <button 
              onClick={handleSaveSettings}
              className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold shadow-sm"
            >
              Save & Load
            </button>
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
      <div className="flex justify-between items-center p-4 bg-white shadow-sm z-10 relative">
        <button 
          onClick={() => setShowExerciseSelector(true)}
          className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
        >
          <List size={24} className="text-gray-700" />
        </button>
        
        <div className="flex flex-col items-center">
           <h1 className="text-sm font-bold text-blue-600">FitSheet Tracker</h1>
           {/* Queue Indicator */}
           {queueLength > 0 && (
             <div className="flex items-center space-x-1 mt-1 animate-pulse">
               <CloudUpload size={14} className="text-orange-500" />
               <span className="text-xs font-medium text-orange-500">{queueLength} pending</span>
             </div>
           )}
        </div>

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
                <div className="p-4 w-full max-w-md mx-auto">
                  <button
                    onClick={handleSubmit}
                    className="w-full bg-blue-600 text-white text-lg font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    Submit Exercise
                  </button>
                  <p className="text-center text-xs text-gray-400 mt-2">
                    Queues results for background submission
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