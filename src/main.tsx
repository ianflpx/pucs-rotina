import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initSync } from './lib/sync';
import { registerServiceWorker } from './lib/push';
import { useStore } from './lib/store';
import { importTransactions } from './pages/Finance';
import './styles.css';

initSync();
registerServiceWorker();

if (import.meta.env.DEV) {
  Object.assign(window, { __pucs: { useStore, importTransactions } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
