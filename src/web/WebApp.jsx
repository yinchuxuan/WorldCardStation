import React from 'react';
import App from '../renderer/App.jsx';
import { hostedCards } from './hostedCards.js';
import './webPlay.css';

function WebApp() {
  React.useEffect(() => {
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); hostedCards.release(); };
  }, []);
  return <div className="web-application" data-platform="web" data-save-policy="manual"><App /></div>;
}

export default WebApp;
