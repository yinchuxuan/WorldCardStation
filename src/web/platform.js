import { webPolicy } from './platformPolicy.js';
import { hostedCards } from './hostedCards.js';
import { controlledScriptExecutor } from '../renderer/platform/controlledScriptExecutor.js';
import { webConfig } from './config.js';
import { webBackground } from './background.js';
import { modelFetch } from './modelFetch.js';
import { imageReady } from './imageReady.js';
import { createHostedRepository } from './cardRepository.js';
import { selectBackgroundImage } from './selectBackground.js';
import { createWebSessions } from './sessions.js';

function unavailable(operation) {
  return () => {
    const error = new Error(`Web 端暂不支持 ${operation}`);
    error.code = 'PLATFORM_UNAVAILABLE';
    error.operation = operation;
    throw error;
  };
}

function unavailableService(name, methods) {
  return Object.freeze(Object.fromEntries(methods.map(method => [method, unavailable(`${name}.${method}`)])));
}

const cards = createHostedRepository();
const rendererServices = Object.freeze({
  config: webConfig,
  background: { ...webBackground, selectImage: selectBackgroundImage },
  sessions: createWebSessions({ scope: async () => { await cards.restore(); return hostedCards.getReference(); },
    onEmpty: reference => { if (hostedCards.getReference()?.key === reference.key) hostedCards.exit(); } }),
  cards: { ...unavailableService('cards', [
    'importFile',
    'stageTavernImport', 'commitTavernImport', 'cancelTavernImport'
  ]), ...cards },
  development: unavailableService('development', ['getInstructions']),
  trace: unavailableService('trace', ['start', 'append', 'close']),
  window: {
    ...unavailableService('window', ['destroy', 'onCloseRequested']),
    isFullscreen: async () => Boolean(document.fullscreenElement),
    async setFullscreen(value) {
      if (value) {
        if (!document.documentElement.requestFullscreen) throw new Error('此浏览器不支持网页全屏');
        await document.documentElement.requestFullscreen();
      } else if (document.fullscreenElement) await document.exitFullscreen();
    }
  }
});
const gameCardPlatform = Object.freeze({
  resources: { ...hostedCards.resources,
    getImageUrl: (...args) => imageReady(hostedCards.resources.getImageUrl(...args))
  },
  repository: { getActiveCard: async () => { await cards.restore(); return hostedCards.repository.getActiveCard(); } },
  scriptExecutor: controlledScriptExecutor
});
const { capabilities, savePolicy, cardPolicy } = webPolicy;

export { gameCardPlatform, rendererServices, modelFetch, capabilities, savePolicy, cardPolicy };
