import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/renderer.css';
import './components/iconFallback.js';

/* global __WORLD_CARD_STATION_TAURI_E2E__ */

async function start() {
  if (__WORLD_CARD_STATION_TAURI_E2E__) await import('@wdio/tauri-plugin');
  const container = document.getElementById('root');
  createRoot(container).render(<App />);
}

void start();
