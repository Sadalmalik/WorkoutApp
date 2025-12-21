import React, { useState, useEffect, useRef } from 'react';
import { Play, Square } from 'lucide-react';

interface TimerProps {
  defaultDuration?: number; // seconds
}

const Timer: React.FC<TimerProps> = ({ defaultDuration = 120 }) => {
  const [duration, setDuration] = useState(defaultDuration);
  const [timeLeft, setTimeLeft] = useState(defaultDuration);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

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
    if (isRunning && timeLeft > 0) {
      timerRef.current = window.setTimeout(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      // Finished
      setIsRunning(false);
      playSound();
      setTimeLeft(duration); // Reset to configured duration
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isRunning, timeLeft, duration]);

  // Handlers
  const toggleTimer = () => {
    if (isRunning) {
      // Stop pressed: Reset immediately
      setIsRunning(false);
      setTimeLeft(duration);
    } else {
      // Play pressed
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
  const progress = 1 - (timeLeft / duration);
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
