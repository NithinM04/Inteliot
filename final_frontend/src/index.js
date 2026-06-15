import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { getFrontendURL, getBackendURL } from './utils/networkConfig';

// Display startup message with network URLs
console.log(
  '%c\n🚀 Starting Inteliot Dashboard...\n',
  'font-size: 16px; font-weight: bold; color: #00d4ff;'
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
