import '@fortawesome/fontawesome-free/css/all.min.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// In development, wipe stale app-state on every startup but preserve
// keys that must survive hot reloads (tutorial dismissal, nav collapsed state).
if (import.meta.env.DEV) {
    const preserve = new Set(['app.tutorial.seen', 'app.nav.collapsed']);
    Object.keys(localStorage)
        .filter((k) => !preserve.has(k))
        .forEach((k) => localStorage.removeItem(k));
}

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
