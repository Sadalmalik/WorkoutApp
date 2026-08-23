import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalStorageStorage, SystemClock } from './core/index.ts';
import { App } from './ui/App.tsx';
import './ui/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find #root element to mount to');
}

// Compose the app with the real adapters. Tests inject InMemoryStorage + FixedClock instead.
const storage = new LocalStorageStorage();
const clock = new SystemClock();

createRoot(rootElement).render(
  <StrictMode>
    <App storage={storage} clock={clock} />
  </StrictMode>,
);
