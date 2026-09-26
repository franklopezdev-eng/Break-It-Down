import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { usePlayer } from './state/player';
import { usePrefs } from './state/prefs';
import { useSession } from './state/session';
import { useWebcam } from './state/webcam';
import './styles/tokens.css';
import './styles/base.css';
import './styles/controls.css';
import './styles/layout.css';
import './styles/stage.css';
import './styles/dock.css';
import './styles/moments.css';

// Handy for poking at state from the browser console while developing.
if (import.meta.env.DEV) Object.assign(window, { __stores: { usePlayer, usePrefs, useSession, useWebcam } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
