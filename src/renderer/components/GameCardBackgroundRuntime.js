import React from 'react';
import {
  getPortraitResources,
  getSceneKind,
  getSceneRelativePath,
  normalizeTextPanel
} from '../../shared/game-card/schema/visualConfig.js';
import { gameCardPlatform } from '../platform/index.js';
import { PropTypes } from './componentPropTypes.js';

async function resolveImageUrl(cardId, relativePath) {
  if (!relativePath) return '';
  return gameCardPlatform.resources.getImageUrl(cardId, relativePath);
}

function useImageRequest(request, getPath, label, onChange, onError, attempt) {
  const currentRef = React.useRef({ signature: null, revision: 0 });
  const handlerRef = React.useRef(onChange);
  const mountedRef = React.useRef(true);
  handlerRef.current = onChange;

  React.useEffect(() => {
    if (!request) return;
    const cardId = request.card?.id || '';
    const relativePath = getPath(request.card, request.state);
    const signature = `${cardId}\0${relativePath}`;
    if (signature === currentRef.current.signature) return;
    const revision = currentRef.current.revision + 1;
    currentRef.current = { signature, revision };
    resolveImageUrl(cardId, relativePath, label).then(url => {
      if (!mountedRef.current || currentRef.current.revision !== revision) return;
      handlerRef.current?.({ url });
    }).catch(error => {
      if (!mountedRef.current || currentRef.current.revision !== revision) return;
      currentRef.current.signature = null;
      onError(error.message);
    });
  }, [attempt, getPath, label, onError, request]);

  React.useEffect(() => () => {
    mountedRef.current = false;
    handlerRef.current?.({ url: '' });
  }, []);
}

function usePortraitRequest(request, onChange, onError, attempt) {
  const currentRef = React.useRef({ signature: null, revision: 0 });
  const handlerRef = React.useRef(onChange);
  const mountedRef = React.useRef(true);
  handlerRef.current = onChange;

  React.useEffect(() => {
    if (!request) return;
    const cardId = request.card?.id || '';
    const sceneKind = getSceneKind(request.card, request.state?.visual?.scene);
    const resources = getPortraitResources(request.card, request.state);
    const signature = `${cardId}\0${sceneKind}\0${resources.map(item => (
      `${item.character}:${item.expression}:${item.path}`
    )).join('\0')}`;
    if (signature === currentRef.current.signature) return;
    const revision = currentRef.current.revision + 1;
    currentRef.current = { signature, revision };
    Promise.all(resources.map(async item => ({
      ...item,
      url: await resolveImageUrl(cardId, item.path, `portrait ${item.character}`)
    }))).then(items => {
      if (!mountedRef.current || currentRef.current.revision !== revision) return;
      const detail = { portraits: items.filter(item => item.url) };
      if (sceneKind === 'cg') detail.immediate = true;
      handlerRef.current?.(detail);
    }).catch(error => {
      if (!mountedRef.current || currentRef.current.revision !== revision) return;
      currentRef.current.signature = null;
      onError(error.message);
    });
  }, [attempt, onError, request]);

  React.useEffect(() => () => {
    mountedRef.current = false;
    handlerRef.current?.({ portraits: [] });
  }, []);
}

function GameCardBackgroundRuntime({
  backgroundRequest,
  portraitRequest,
  onBackgroundChange,
  onPortraitChange,
  onVisualPanelChange
}) {
  const [error, setError] = React.useState('');
  const [attempt, setAttempt] = React.useState(0);
  useImageRequest(backgroundRequest, getSceneRelativePath, 'scene', onBackgroundChange, setError, attempt);
  usePortraitRequest(portraitRequest, onPortraitChange, setError, attempt);

  React.useEffect(() => {
    if (!backgroundRequest) return;
    const cardId = backgroundRequest.card?.id || '';
    const textPanel = normalizeTextPanel(backgroundRequest.state?.visual?.textPanel);
    onVisualPanelChange?.({ textPanel, cardId });
  }, [backgroundRequest, onVisualPanelChange]);

  React.useEffect(() => () => {
    onVisualPanelChange?.({ textPanel: 'center', cardId: '' });
  }, [onVisualPanelChange]);
  return error ? React.createElement('div', { role: 'alert', className: 'web-resource-error' },
    `演出资源加载失败：${error}`, React.createElement('button', { onClick: () => {
      setError(''); setAttempt(value => value + 1);
    } }, '重试演出加载')) : null;
}

const updateRequest = PropTypes.shape({
  id: PropTypes.number.isRequired,
  card: PropTypes.object,
  state: PropTypes.object.isRequired
});

GameCardBackgroundRuntime.propTypes = {
  backgroundRequest: updateRequest,
  portraitRequest: updateRequest,
  onBackgroundChange: PropTypes.func,
  onPortraitChange: PropTypes.func,
  onVisualPanelChange: PropTypes.func
};

export default GameCardBackgroundRuntime;
