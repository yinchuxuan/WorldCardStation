import { createTauriGameCardPlatform } from '../../src/renderer/platform/tauriGameCardPlatform.js';
import { BACKGROUND_EVENT, createTauriRendererServices } from '../../src/renderer/platform/tauriRendererServices.js';

describe('Tauri renderer adapters', () => {
  test('maps service calls to command names and named payloads', async () => {
    const invoke = jest.fn(async () => ({ success: true }));
    const services = createTauriRendererServices({ invoke, listen: jest.fn() });

    await services.config.save({ modelName: 'model' });
    await services.sessions.saveHistory([{ role: 'user' }], { gameState: { score: 1 } });
    await services.sessions.rename('session-1', 'Renamed');
    await services.cards.list();
    await services.cards.setActive('card-1');
    await services.cards.uninstall('card-2');

    expect(invoke).toHaveBeenNthCalledWith(1, 'save_model_config', {
      config: { modelName: 'model' }
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'save_chat_history', {
      messages: [{ role: 'user' }], options: { gameState: { score: 1 } }
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'rename_chat_session', {
      id: 'session-1', title: 'Renamed'
    });
    expect(invoke).toHaveBeenNthCalledWith(4, 'get_game_cards', {});
    expect(invoke).toHaveBeenNthCalledWith(5, 'set_active_game_card', { id: 'card-1' });
    expect(invoke).toHaveBeenNthCalledWith(6, 'delete_game_card', { id: 'card-2' });
  });

  test('maps resource calls and accepts command result envelopes', async () => {
    const invoke = jest.fn(async command => ({
      success: true,
      content: command === 'read_game_card_file' ? 'text' : undefined,
      url: command.includes('image') ? 'asset://image' : 'asset://audio',
      card: command === 'get_active_game_card' ? { id: 'card' } : undefined
    }));
    const convertFileSrc = jest.fn(path => `local://localhost/${encodeURIComponent(path)}`);
    const platform = createTauriGameCardPlatform({ invoke, convertFileSrc });

    await platform.resources.readText('card', 'content.md');
    await platform.resources.getImageUrl('card', 'image.png');
    await platform.repository.getActiveCard();

    expect(invoke).toHaveBeenNthCalledWith(1, 'read_game_card_file', {
      cardId: 'card', relativePath: 'content.md'
    });
    expect(convertFileSrc).toHaveBeenCalledWith('game-card/card/image/image.png', 'local');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  test('reuses the active card until an import advances the runtime revision', async () => {
    let activeCard = { id: 'card', version: '1' };
    const invoke = jest.fn(async command => {
      if (command === 'import_game_card_from_file') {
        activeCard = { id: 'card', version: '2' };
        return { success: true, card: activeCard };
      }
      return { success: true, card: activeCard };
    });
    const client = { invoke, listen: jest.fn(), convertFileSrc: jest.fn() };
    const platform = createTauriGameCardPlatform(client);
    const services = createTauriRendererServices(client);

    const first = await platform.repository.getActiveCard();
    const repeated = await platform.repository.getActiveCard();
    await services.cards.importFile();
    const reloaded = await platform.repository.getActiveCard();

    expect(repeated).toBe(first);
    expect(reloaded).toEqual({ id: 'card', version: '2' });
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'get_active_game_card',
      'import_game_card_from_file',
      'get_active_game_card'
    ]);
  });

  test('imports packaged game cards through the native file picker', async () => {
    const invoke = jest.fn(async () => ({ success: true, card: { id: 'packaged' } }));
    const services = createTauriRendererServices({ invoke, listen: jest.fn() });

    await expect(services.cards.importFile()).resolves.toEqual({ id: 'packaged' });

    expect(invoke).toHaveBeenCalledWith('import_game_card_from_file', {});
  });

  test('normalizes rejected and business errors with validation details', async () => {
    const failure = { error: 'invalid card', stage: 'validate', file: 'card.json', details: [{ message: 'bad' }] };
    const rejected = createTauriGameCardPlatform({ invoke: async () => { throw failure; } });
    const business = createTauriRendererServices({
      invoke: async () => ({ success: false, error: 'canceled', canceled: true }),
      listen: jest.fn(),
      convertFileSrc: jest.fn()
    });

    await expect(rejected.repository.getActiveCard()).rejects.toMatchObject({
      message: 'invalid card', stage: 'validate', file: 'card.json', details: failure.details
    });
    await expect(business.cards.importFile()).rejects.toMatchObject({
      message: 'canceled', canceled: true
    });
  });

  test('subscribes to background events and handles early disposal', async () => {
    let eventListener;
    let resolveUnlisten;
    const unlisten = jest.fn();
    const listen = jest.fn((_event, listener) => {
      eventListener = listener;
      return new Promise(resolve => { resolveUnlisten = resolve; });
    });
    const onChange = jest.fn();
    const unsubscribe = createTauriRendererServices({
      invoke: jest.fn(), listen, convertFileSrc: path => `local://${path}`
    })
      .background.subscribe(onChange);

    eventListener({ payload: { config: { opacity: 0.5 } } });
    unsubscribe();
    resolveUnlisten(unlisten);
    await Promise.resolve();

    expect(listen).toHaveBeenCalledWith(BACKGROUND_EVENT, expect.any(Function));
    expect(onChange).toHaveBeenCalledWith({ opacity: 0.5 });
    expect(unlisten).toHaveBeenCalled();
  });

  test('normalizes the canonical user background URL at the adapter boundary', async () => {
    const invoke = jest.fn(async (command, args) => {
      if (command === 'get_background_config' || command === 'save_background_config') {
        return args?.config || { backgroundImageUrl: 'local://user-background/current' };
      }
      return 'local://user-background/current';
    });
    const convertFileSrc = jest.fn(path => `http://local.localhost/${encodeURIComponent(path)}`);
    const services = createTauriRendererServices({ invoke, listen: jest.fn(), convertFileSrc });

    const loaded = await services.background.load();
    const selected = await services.background.selectImage();
    await services.background.save({ backgroundImageUrl: selected, backgroundOpacity: 0.5 });

    expect(loaded.backgroundImageUrl).toBe('http://local.localhost/user-background%2Fcurrent');
    expect(selected).toBe(loaded.backgroundImageUrl);
    expect(invoke).toHaveBeenLastCalledWith('save_background_config', {
      config: {
        backgroundImageUrl: 'local://user-background/current',
        backgroundOpacity: 0.5
      }
    });
  });
});
