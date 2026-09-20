import React from 'react';
import App from '../renderer/App.jsx';
import { hostedCards } from './hostedCards.js';
import './webPlay.css';

function WebApp() {
  React.useEffect(() => {
    return () => hostedCards.release();
  }, []);
  return <div className="web-application" data-platform="web" data-save-policy="manual"><App /></div>;
}

export default WebApp;
