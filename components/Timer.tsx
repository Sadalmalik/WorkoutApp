import React, { useState, useEffect, useRef } from 'react';
import { Play, Square } from 'lucide-react';

interface TimerProps {
  defaultDuration?: number; // seconds
}

const Timer: React.FC<TimerProps> = ({ defaultDuration = 120 }) => {
  const [duration, setDuration] = useState(defaultDuration);
  const [timeLeft, setTimeLeft] = useState(defaultDuration);
  const [isRunning, setIsRunning] = useState(false);
  
  // Sound effect
  const playSound = () => {
    // Simple beep using AudioContext or generic HTML5 audio
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.start();
    setTimeout(() => {
        osc.stop();
        ctx.close();
    }, 500);
  };

  // Timer logic
  useEffect(() => {
    let interval: number | null = null;
    
    if (isRunning && timeLeft > 0) {
      interval = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
             // Will reach 0
             return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      // Finished logic
      setIsRunning(false);
      playSound();
      // We do NOT reset to duration here immediately, 
      // so the user sees '00:00' and the completed circle.
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeLeft]);

  // Handlers
  const toggleTimer = () => {
    if (isRunning) {
      // Stop pressed: Reset immediately
      setIsRunning(false);
      setTimeLeft(duration);
    } else {
      // Play pressed
      if (timeLeft === 0) {
        // If restarting from finished state, reset first
        setTimeLeft(duration);
      }
      setIsRunning(true);
    }
  };

  const adjustDuration = (delta: number) => {
    if (isRunning) return; // Disabled while running
    const newDuration = Math.max(10, duration + delta); // Min 10 seconds
    setDuration(newDuration);
    setTimeLeft(newDuration);
  };

  // Formatting
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // SVG Calculations
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  // Progress fills clockwise: 
  // Full dasharray = circumference. 
  // Offset moves the gap. To fill clockwise from top, we need to reduce offset.
  const progress = duration > 0 ? (1 - (timeLeft / duration)) : 0;
  const strokeDashoffset = circumference * (1 - progress); // Inverted logic for filling

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* Timer Display Container */}
      <div className="flex items-center space-x-4">
        
        {/* Left Controls */}
        <div className="flex flex-col space-y-2">
          {[-10, -30, -60].map((val) => (
            <button
              key={val}
              onClick={() => adjustDuration(val)}
              disabled={isRunning}
              className={`p-2 rounded bg-gray-200 text-xs font-bold ${isRunning ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-300'}`}
            >
              {val}s
            </button>
          ))}
        </div>

        {/* Circular Timer */}
        <div className="relative">
          <svg width="200" height="200" className="transform -rotate-90">
             {/* Background Circle */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="transparent"
              stroke="#e5e7eb" // gray-200
              strokeWidth="10"
            />
            {/* Progress Circle */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="transparent"
              stroke="#3b82f6" // blue-500
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={-strokeDashoffset} // Negative to fill clockwise
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-4xl font-mono font-bold text-gray-800">
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex flex-col space-y-2">
          {[10, 30, 60].map((val) => (
            <button
              key={val}
              onClick={() => adjustDuration(val)}
              disabled={isRunning}
              className={`p-2 rounded bg-gray-200 text-xs font-bold ${isRunning ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-300'}`}
            >
              +{val}s
            </button>
          ))}
        </div>
      </div>

      {/* Main Control Button */}
      <button
        onClick={toggleTimer}
        className={`mt-4 w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-colors ${
          isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
        }`}
      >
        {isRunning ? <Square fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} className="ml-1" />}
      </button>
    </div>
  );
};

export default Timer;