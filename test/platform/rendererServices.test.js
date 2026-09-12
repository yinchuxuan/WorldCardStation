import { createMemoryRendererServices } from '../../src/renderer/platform/memoryRendererServices.js';
import { createTauriRendererServices } from '../../src/renderer/platform/tauriRendererServices.js';
import { verifyRendererServices } from './adapterContracts.js';

function mockTauriClient() {
  let fullscreen = false;
  const invoke = jest.fn(async (command, args) => {
    const values = {
      get_model_config: {}, save_model_config: args.config,
      get_background_config: {}, save_background_config: args.config,
      select_background_image: 'asset://background',
      get_chat_history: { messages: [] }, save_chat_history: {},
      list_chat_sessions: { sessions: [], activeId: null }, get_active_chat_session: null,
      create_chat_session: { id: 'session-1' }, set_active_chat_session: { id: args.id },
      rename_chat_session: { id: args.id, title: args.title }, delete_chat_session: { activeId: null },
      get_game_cards: [], set_active_game_card: {},
      import_game_card_from_file: null, delete_game_card: {}
    };
    return values[command];
  });
  return {
    invoke,
    listen: jest.fn(async () => () => {}),
    convertFileSrc: path => `asset:///${encodeURIComponent(path)}`,
    getCurrentWindow: () => ({
      destroy: async () => {},
      isFullscreen: async () => fullscreen,
      onCloseRequested: async () => () => {},
      setFullscreen: async value => { fullscreen = value; }
    })
  };
}

describe('renderer service contract', () => {
  test('memory adapter implements the renderer services', async () => {
    await verifyRendererServices(createMemoryRendererServices({
      config: {}, background: {}, sessions: [], selectedImage: 'asset://background'
    }));
  });

  test('Tauri adapter implements the same renderer services', async () => {
    await verifyRendererServices(createTauriRendererServices(mockTauriClient()));
  });
});
