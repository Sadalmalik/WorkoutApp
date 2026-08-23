import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalStorageStorage } from './core/index.ts';
import { App } from './ui/App.tsx';
import './ui/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find #root element to mount to');
}

// Compose the app with the real localStorage-backed adapter. Tests use InMemoryStorage instead.
const storage = new LocalStorageStorage();

createRoot(rootElement).render(
  <StrictMode>
    <App storage={storage} />
  </StrictMode>,
);
