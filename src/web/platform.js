import { webPolicy } from './platformPolicy.js';

function unavailable(operation) {
  return () => {
    const error = new Error(`Web 端暂不支持 ${operation}，当前版本仅支持目录浏览。`);
    error.code = 'PLATFORM_UNAVAILABLE';
    error.operation = operation;
    throw error;
  };
}

function unavailableService(name, methods) {
  return Object.freeze(Object.fromEntries(methods.map(method => [method, unavailable(`${name}.${method}`)])));
}

const rendererServices = Object.freeze({
  config: unavailableService('config', ['load', 'save']),
  background: unavailableService('background', ['load', 'save', 'selectImage', 'subscribe']),
  sessions: unavailableService('sessions', [
    'loadHistory', 'saveHistory', 'list', 'getActive', 'create', 'setActive', 'rename', 'delete'
  ]),
  cards: unavailableService('cards', [
    'list', 'setActive', 'uninstall', 'importFile',
    'stageTavernImport', 'commitTavernImport', 'cancelTavernImport'
  ]),
  development: unavailableService('development', ['getInstructions']),
  trace: unavailableService('trace', ['start', 'append', 'close']),
  window: unavailableService('window', ['destroy', 'isFullscreen', 'onCloseRequested', 'setFullscreen'])
});
const gameCardPlatform = Object.freeze({
  resources: unavailableService('resources', ['readText', 'getImageUrl', 'getAudioUrl']),
  repository: unavailableService('repository', ['getActiveCard']),
  scriptExecutor: unavailableService('scriptExecutor', ['run'])
});
const modelFetch = unavailable('modelFetch');
const { capabilities, savePolicy } = webPolicy;

export { gameCardPlatform, rendererServices, modelFetch, capabilities, savePolicy };
