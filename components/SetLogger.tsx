import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { ScheduledExercise } from '../types';

interface SetData {
  weight: number;
  reps: number;
}

interface SetLoggerProps {
  exercise: ScheduledExercise;
  onSetsChanged: (sets: SetData[]) => void;
  currentSets: SetData[];
}

const SetLogger: React.FC<SetLoggerProps> = ({ exercise, onSetsChanged, currentSets }) => {
  const [weightInput, setWeightInput] = useState<string>(exercise.recWeight.toString());
  const [repsInput, setRepsInput] = useState<string>(exercise.recReps.toString());

  const handleAddSet = () => {
    const w = parseFloat(weightInput);
    const r = parseFloat(repsInput);

    if (!isNaN(w) && !isNaN(r)) {
      const newSets = [...currentSets, { weight: w, reps: r }];
      onSetsChanged(newSets);
      // Clear inputs (optional, or keep last values for convenience? Prompt says "Clears input fields")
      setWeightInput('');
      setRepsInput('');
    }
  };

  const adjustInput = (setter: React.Dispatch<React.SetStateAction<string>>, value: string, delta: number) => {
    const current = parseFloat(value) || 0;
    setter((current + delta).toString());
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 flex flex-col space-y-4">
      {/* UI Table */}
      <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
        <table className="w-full text-center">
          <thead className="bg-gray-100 text-xs text-gray-600 uppercase">
            <tr>
              <th className="py-2">Set</th>
              <th className="py-2">Weight <span className="text-gray-400">({exercise.recWeight})</span></th>
              <th className="py-2">Reps <span className="text-gray-400">({exercise.recReps})</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {currentSets.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-sm text-gray-400 italic">No sets recorded</td>
              </tr>
            ) : (
              currentSets.map((set, idx) => (
                <tr key={idx}>
                  <td className="py-2 text-gray-500 text-sm">{idx + 1}</td>
                  <td className="py-2 font-medium">{set.weight}</td>
                  <td className="py-2 font-medium">{set.reps}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Input Form */}
      <div className="flex items-end space-x-2">
        {/* Weight Input */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Weight</label>
          <div className="flex items-center border rounded-md bg-white">
            <button 
              className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border-r"
              onClick={() => adjustInput(setWeightInput, weightInput, -1)}
            >-</button>
            <input
              type="number"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="w-full text-center p-2 outline-none"
              placeholder="kg"
            />
            <button 
              className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border-l"
              onClick={() => adjustInput(setWeightInput, weightInput, 1)}
            >+</button>
          </div>
        </div>

        {/* Reps Input */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Reps</label>
          <div className="flex items-center border rounded-md bg-white">
             <button 
              className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border-r"
              onClick={() => adjustInput(setRepsInput, repsInput, -1)}
            >-</button>
            <input
              type="number"
              value={repsInput}
              onChange={(e) => setRepsInput(e.target.value)}
              className="w-full text-center p-2 outline-none"
              placeholder="#"
            />
            <button 
               className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border-l"
               onClick={() => adjustInput(setRepsInput, repsInput, 1)}
            >+</button>
          </div>
        </div>

        {/* Add Button */}
        <button
          onClick={handleAddSet}
          className="h-[42px] w-[42px] bg-blue-600 text-white rounded-md flex items-center justify-center shadow hover:bg-blue-700 active:scale-95 transition-transform"
        >
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
};

export default SetLogger;
