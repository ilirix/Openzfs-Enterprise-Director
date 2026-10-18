import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AppSettingsProvider } from './context/AppSettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AppSettingsProvider>
      <App />
    </AppSettingsProvider>
  </ErrorBoundary>
);

