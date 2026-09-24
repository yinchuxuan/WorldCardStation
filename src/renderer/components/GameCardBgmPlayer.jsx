import React from 'react';
import { gameCardPlatform } from '../platform/index.js';
import { PropTypes } from './componentPropTypes.js';

const BGM_PLAY_DELAY_MS = 1000;

function getBgmPath(request) {
  const key = request?.state?.audio?.bgm;
  return typeof key === 'string' ? (request?.card?.audio?.bgm?.[key] || '') : '';
}

function GameCardBgmPlayer({ updateRequest, stopToken = 0 }) {
  const audioRef = React.useRef(null);
  const sourceRef = React.useRef({ signature: null, revision: 0, url: '' });
  const pendingPlayRef = React.useRef(false);
  const playingRef = React.useRef(false);
  const enabledRef = React.useRef(true);
  const mountedRef = React.useRef(true);
  const lastStopTokenRef = React.useRef(stopToken);
  const playTimerRef = React.useRef(null);
  const [audioSource, setAudioSource] = React.useState('');
  const [blocked, setBlocked] = React.useState(false);
  const [enabled, setEnabled] = React.useState(true);
  const [error, setError] = React.useState('');
  const [attempt, setAttempt] = React.useState(0);
  enabledRef.current = enabled;

  const cancelScheduledPlay = React.useCallback(() => {
    if (playTimerRef.current === null) return;
    window.clearTimeout(playTimerRef.current);
    playTimerRef.current = null;
  }, []);

  const stop = React.useCallback(() => {
    cancelScheduledPlay();
    const audio = audioRef.current;
    if (audio && playingRef.current) audio.pause();
    playingRef.current = false;
  }, [cancelScheduledPlay]);

  const playCurrent = React.useCallback((forceEnabled = false) => {
    cancelScheduledPlay();
    playTimerRef.current = window.setTimeout(async () => {
      playTimerRef.current = null;
      const audio = audioRef.current;
      if (!audio || !sourceRef.current.url || (!enabledRef.current && !forceEnabled)) return;
      try {
        audio.currentTime = 0;
        await audio.play();
        playingRef.current = true;
        pendingPlayRef.current = false;
        setBlocked(false);
      } catch (_) {
        playingRef.current = false;
        pendingPlayRef.current = false;
        setBlocked(true);
      }
    }, BGM_PLAY_DELAY_MS);
  }, [cancelScheduledPlay]);

  // A new request in the same render supersedes the stop used to clear the old Session.
  React.useEffect(() => {
    if (stopToken === lastStopTokenRef.current) return;
    lastStopTokenRef.current = stopToken;
    pendingPlayRef.current = false;
    stop();
  }, [stop, stopToken]);

  React.useEffect(() => {
    if (!updateRequest) return;
    const cardId = updateRequest.card?.id || '';
    const relativePath = getBgmPath(updateRequest);
    const signature = `${cardId}\0${relativePath}`;
    pendingPlayRef.current = true;
    if (signature === sourceRef.current.signature) {
      if (sourceRef.current.url) {
        stop();
        void playCurrent();
      }
      return;
    }

    stop();
    setBlocked(false);
    setError('');
    const revision = sourceRef.current.revision + 1;
    sourceRef.current = { signature, revision, url: '' };
    setAudioSource('');
    if (!relativePath) {
      pendingPlayRef.current = false;
      return;
    }
    gameCardPlatform.resources.getAudioUrl(cardId, relativePath)
      .then(url => {
        if (!mountedRef.current || sourceRef.current.revision !== revision) return;
        sourceRef.current = { signature, revision, url };
        setAudioSource(url);
      })
      .catch(error => {
        if (!mountedRef.current || sourceRef.current.revision !== revision) return;
        console.error('Failed to load game card audio:', error.message);
        sourceRef.current.signature = null;
        setError(error.message);
        pendingPlayRef.current = false;
      });
  }, [attempt, playCurrent, stop, updateRequest]);

  React.useEffect(() => {
    if (audioSource && pendingPlayRef.current) void playCurrent();
  }, [audioSource, playCurrent]);
  React.useEffect(() => () => {
    mountedRef.current = false;
    stop();
  }, [stop]);

  const toggle = event => {
    event.stopPropagation();
    if (error) { setError(''); setAttempt(value => value + 1); return; }
    if (blocked) {
      // play() must run in the click handler for browsers requiring user activation.
      const audio = audioRef.current;
      if (!audio) return;
      cancelScheduledPlay();
      setEnabled(true);
      audio.play().then(() => { playingRef.current = true; setBlocked(false); })
        .catch(() => setBlocked(true));
      return;
    }
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    if (!nextEnabled) stop();
    else void playCurrent(true);
  };
  const icon = enabled ? 'music_note' : 'music_off';
  const title = error ? `重试 BGM：${error}` : blocked ? '浏览器需要手动播放 BGM' : (enabled ? '关闭 BGM' : '开启 BGM');
  return <div className="game-card-bgm-player" data-gc-part="bgm-player">
    <audio ref={audioRef} src={audioSource || undefined} preload="auto" loop onError={() => {
      if (audioSource) { sourceRef.current.signature = null; setError('音频无法解码或加载'); }
    }} />
    <button type="button"
      className={`md-btn md-btn-icon game-card-bgm-btn${blocked ? ' blocked' : ''}${!audioSource ? ' no-source' : ''}`}
      data-gc-part="bgm-button" onClick={toggle} title={title} aria-label={title}>
      <span className="material-icons">{icon}</span>
    </button>
  </div>;
}

GameCardBgmPlayer.propTypes = {
  updateRequest: PropTypes.shape({
    id: PropTypes.number.isRequired,
    card: PropTypes.object,
    state: PropTypes.object.isRequired
  }),
  stopToken: PropTypes.number
};

export default GameCardBgmPlayer;
