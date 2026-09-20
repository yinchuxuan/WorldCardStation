import React from 'react';
import ChatPanel from './ChatPanel.jsx';
import GameCardPortraitLayers from './components/GameCardPortraitLayers.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { rendererServices } from './platform/index.js';
import useFullscreenHotkey from './useFullscreenHotkey.js';

const EMPTY_PORTRAIT_LAYERS = {
  current: [], exiting: [], exitingCount: 0, expressionExits: []
};

// App Component
function App() {
  useFullscreenHotkey(rendererServices.window);
  const [theme, setTheme] = React.useState('light');
  const [backgroundConfig, setBackgroundConfig] = React.useState({
    backgroundImageUrl: '',
    backgroundOpacity: 0.5
  });
  const [gameCardBackgroundUrl, setGameCardBackgroundUrl] = React.useState('');
  const [portraitLayers, setPortraitLayers] = React.useState(EMPTY_PORTRAIT_LAYERS);
  const [backgroundLayers, setBackgroundLayers] = React.useState({ current: '', previous: '' });
  const [visualPanel, setVisualPanel] = React.useState({ textPanel: 'center', cardId: '' });

  // Initialize theme from system preference or localStorage
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialTheme = prefersDark ? 'dark' : 'light';
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  }, []);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Handle background change
  const handleBackgroundChange = React.useCallback((config) => {
    setBackgroundConfig(config);
  }, []);

  React.useEffect(() => {
    return rendererServices.background.subscribe(setBackgroundConfig);
  }, []);

  const handleGameCardBackgroundChange = React.useCallback((detail) => {
    setGameCardBackgroundUrl(detail?.url || '');
  }, []);

  const handleGameCardPortraitChange = React.useCallback((detail) => {
    const nextPortraits = Array.isArray(detail?.portraits) ? detail.portraits : [];
    if (detail?.immediate === true) {
      setPortraitLayers(EMPTY_PORTRAIT_LAYERS);
      return;
    }
    setPortraitLayers(({ current }) => {
      const nextCharacters = new Set(nextPortraits.map(({ character }) => character));
      const exiting = current
        .map((portrait, index) => ({ ...portrait, index, transition: 'exit' }))
        .filter(({ character }) => !nextCharacters.has(character));
      const expressionExits = current.filter((portrait) => {
        const next = nextPortraits.find(item => item.character === portrait.character);
        return next && next.expression !== portrait.expression;
      });
      const next = nextPortraits.map((portrait) => {
        const previous = current.find(item => item.character === portrait.character);
        const transition = !previous
          ? 'enter'
          : previous.expression === portrait.expression ? 'stable' : 'expression';
        return { ...portrait, transition };
      });
      return { current: next, exiting, exitingCount: current.length, expressionExits };
    });
  }, []);

  const handlePortraitExitEnd = React.useCallback(() => {
    setPortraitLayers(current => current.exiting.length
      ? { ...current, exiting: [] }
      : current);
  }, []);

  const handleExpressionExitEnd = React.useCallback((character) => {
    setPortraitLayers(current => ({
      ...current,
      expressionExits: (current.expressionExits || [])
        .filter(item => item.character !== character)
    }));
  }, []);

  const handleVisualPanelChange = React.useCallback((detail) => {
    const textPanel = ['left', 'right'].includes(detail?.textPanel) ? detail.textPanel : 'center';
    setVisualPanel({ textPanel, cardId: detail?.cardId || '' });
  }, []);

  const hasBackgroundImage = Boolean(gameCardBackgroundUrl || backgroundConfig.backgroundImageUrl);
  const gameCardPortraits = portraitLayers.current;
  const cssUrl = (url) => `url("${String(url).replace(/["\\]/g, '\\$&')}")`;
  const gameCardThemeClass = React.useMemo(() => {
    if (!visualPanel.cardId) return '';
    return ` game-card-theme-${visualPanel.cardId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;
  }, [visualPanel.cardId]);

  React.useEffect(() => {
    setBackgroundLayers(prev => prev.current === gameCardBackgroundUrl
      ? prev
      : gameCardBackgroundUrl
        ? { current: gameCardBackgroundUrl, previous: prev.current }
        : { current: '', previous: '' });
  }, [gameCardBackgroundUrl]);

  const handleBackgroundAnimationEnd = React.useCallback(() => {
    setBackgroundLayers(prev => prev.previous ? { ...prev, previous: '' } : prev);
  }, []);

  const getBackgroundStyle = React.useCallback((url) => url ? {
    backgroundImage: cssUrl(url),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  } : {}, []);

  // Generate overlay style for opacity
  const getOverlayStyle = React.useCallback(() => {
    if (hasBackgroundImage) {
      const baseColor = theme === 'dark' ? 'rgba(20, 18, 24,' : 'rgba(255, 251, 254,';
      return {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: `${baseColor} 1)`,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: backgroundConfig.backgroundOpacity
      };
    }
    return {};
  }, [hasBackgroundImage, backgroundConfig.backgroundOpacity, theme]);

  return (
    <div
      className={`app-container game-card-visual-layout game-card-visual-position-${visualPanel.textPanel}${gameCardThemeClass}${hasBackgroundImage ? ' has-background-image' : ''}${gameCardPortraits.length || portraitLayers.exiting.length ? ' has-portrait' : ''}`}
      data-gc-part="app"
    >
      <div className="app-base-background" data-gc-part="base-background"
        style={{ '--app-base-background-image': backgroundConfig.backgroundImageUrl
          ? cssUrl(backgroundConfig.backgroundImageUrl) : 'none' }} />
      {backgroundLayers.previous && <div className="app-background-layer app-background-layer-previous" style={getBackgroundStyle(backgroundLayers.previous)} />}
      {backgroundLayers.current && <div key={backgroundLayers.current} className="app-background-layer app-background-layer-current" style={getBackgroundStyle(backgroundLayers.current)} onAnimationEnd={handleBackgroundAnimationEnd} />}
      {hasBackgroundImage && <div data-gc-part="background-overlay" style={getOverlayStyle()} />}
      <GameCardPortraitLayers layers={portraitLayers}
        onExitEnd={handlePortraitExitEnd} onExpressionExitEnd={handleExpressionExitEnd} />
      <div className="app-content-wrapper">
        <ChatPanel
          onBackgroundChange={handleGameCardBackgroundChange}
          onPortraitChange={handleGameCardPortraitChange}
          onVisualPanelChange={handleVisualPanelChange}
        />
      </div>
      <SettingsPanel onToggleTheme={toggleTheme} theme={theme} onBackgroundChange={handleBackgroundChange} />
    </div>
  );
}

export default App;
