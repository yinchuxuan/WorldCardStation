import { tauriBridge } from './tauriBridge.js';
import { invokeTauriCommand } from './tauriCommand.js';
import { invalidateGameCardRuntimeCache } from '../gameCard/gameCardRuntimeCache.js';
import {
  toRendererBackground,
  toStoredBackground,
  userBackgroundUrl
} from './tauriResourceUrl.js';

const BACKGROUND_EVENT = 'background-config-changed';

function subscribeToBackground(client, listener) {
  let disposed = false;
  let unlisten = null;
  const subscription = client.listen(BACKGROUND_EVENT, (event) => {
    const payload = event?.payload;
    listener(toRendererBackground(payload?.config ?? payload, client.convertFileSrc));
  });
  Promise.resolve(subscription)
    .then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    })
    .catch(() => {});
  return () => {
    disposed = true;
    if (unlisten) unlisten();
  };
}

function subscribeToWindowClose(client, listener) {
  let disposed = false;
  let unlisten = null;
  Promise.resolve(client.getCurrentWindow().onCloseRequested(listener))
    .then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    })
    .catch(() => {});
  return () => {
    disposed = true;
    if (unlisten) unlisten();
  };
}

/** @returns {import('./contracts.js').RendererServices} */
function createTauriRendererServices(client = tauriBridge) {
  const call = (command, args, field) => invokeTauriCommand(client.invoke, command, args, field);
  return Object.freeze({
    config: Object.freeze({
      load: () => call('get_model_config', {}, 'config'),
      save: config => call('save_model_config', { config }, 'config')
    }),
    background: Object.freeze({
      load: async () => toRendererBackground(
        await call('get_background_config', {}, 'config'), client.convertFileSrc
      ),
      save: async config => toRendererBackground(
        await call('save_background_config', {
          config: toStoredBackground(config, client.convertFileSrc)
        }, 'config'),
        client.convertFileSrc
      ),
      selectImage: async () => {
        const selected = await call('select_background_image', {}, 'localUrl');
        return selected ? userBackgroundUrl(client.convertFileSrc) : '';
      },
      subscribe: listener => subscribeToBackground(client, listener)
    }),
    sessions: Object.freeze({
      loadHistory: () => call('get_chat_history'),
      saveHistory: (messages, options) => call('save_chat_history', { messages, options }),
      list: () => call('list_chat_sessions'),
      getActive: () => call('get_active_chat_session', {}, 'session'),
      create: title => call('create_chat_session', { title }),
      setActive: id => call('set_active_chat_session', { id }),
      rename: (id, title) => call('rename_chat_session', { id, title }),
      delete: id => call('delete_chat_session', { id })
    }),
    cards: Object.freeze({
      list: () => call('get_game_cards', {}, 'cards'),
      setActive: async id => {
        const result = await call('set_active_game_card', { id });
        invalidateGameCardRuntimeCache();
        return result;
      },
      uninstall: async id => {
        const result = await call('delete_game_card', { id });
        invalidateGameCardRuntimeCache();
        return result;
      },
      importDirectory: async () => {
        const card = await call('import_game_card_from_directory', {}, 'card');
        invalidateGameCardRuntimeCache();
        return card;
      },
      importFile: async ({ tavernOnly = false } = {}) => {
        const card = await call('import_game_card_from_file', tavernOnly ? { tavernOnly: true } : {}, 'card');
        invalidateGameCardRuntimeCache();
        return card;
      },
      stageTavernImport: (token, plan, targetId = null) => call('stage_tavern_import', { token, plan, targetId }),
      commitTavernImport: async (token, revision) => {
        const card = await call('commit_tavern_import', { token, revision });
        invalidateGameCardRuntimeCache();
        return card;
      },
      cancelTavernImport: token => call('cancel_tavern_import', { token })
    }),
    window: Object.freeze({
      destroy: () => client.getCurrentWindow().destroy(),
      isFullscreen: () => client.getCurrentWindow().isFullscreen(),
      onCloseRequested: listener => subscribeToWindowClose(client, listener),
      setFullscreen: fullscreen => client.getCurrentWindow().setFullscreen(fullscreen)
    })
  });
}

export { BACKGROUND_EVENT, createTauriRendererServices };
