const requests = new Map();

class MockChannel {}

function requirePlatformMock() {
  if (!global.platformMock) throw new Error('Tauri test platform is unavailable');
  return global.platformMock;
}

const commandMethods = {
  start_session_trace: ['startSessionTrace', 'scope', 'snapshot'],
  append_session_trace: ['appendSessionTrace', 'token', 'records'],
  close_session_trace: ['closeSessionTrace', 'token'],
  get_game_card_development_instructions: ['getGameCardDevelopmentInstructions'],
  get_model_config: ['getModelConfig'],
  save_model_config: ['saveModelConfig', 'config'],
  get_background_config: ['getBackgroundConfig'],
  save_background_config: ['saveBackgroundConfig', 'config'],
  select_background_image: ['selectBackgroundImage'],
  get_chat_history: ['getChatHistory'],
  save_chat_history: ['saveChatHistory', 'messages', 'options'],
  list_chat_sessions: ['listChatSessions'],
  get_active_chat_session: ['getActiveChatSession'],
  create_chat_session: ['createChatSession', 'title'],
  set_active_chat_session: ['setActiveChatSession', 'id'],
  rename_chat_session: ['renameChatSession', 'id', 'title'],
  delete_chat_session: ['deleteChatSession', 'id'],
  get_game_cards: ['getGameCards'],
  import_game_card_from_directory: ['importGameCardFromDirectory'],
  import_game_card_from_file: ['importGameCardFromFile'],
  set_active_game_card: ['setActiveGameCard', 'id'],
  delete_game_card: ['deleteGameCard', 'id'],
  get_active_game_card: ['getActiveGameCard'],
  read_game_card_file: ['readGameCardFile', 'cardId', 'relativePath']
};

async function invokePlatformCommand(command, args = {}) {
  const mapping = commandMethods[command];
  if (!mapping) throw new Error(`Unexpected Tauri command: ${command}`);
  const [method, ...keys] = mapping;
  const fn = requirePlatformMock()[method];
  if (typeof fn !== 'function') throw new Error(`Missing Tauri test command: ${method}`);
  return fn(...keys.map(key => args[key]));
}

async function streamFetch(args) {
  const { request, onEvent } = args;
  const controller = new AbortController();
  requests.set(request.requestId, { controller, channel: onEvent });
  try {
    const response = await global.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal
    });
    onEvent.onmessage({ type: 'response', status: response.status ?? (response.ok ? 200 : 500) });
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      let chunk;
      while (!(chunk = await reader.read()).done) {
        onEvent.onmessage({ type: 'chunk', bytes: Array.from(chunk.value) });
      }
    } else if (typeof response.json === 'function') {
      const bytes = new TextEncoder().encode(JSON.stringify(await response.json()));
      onEvent.onmessage({ type: 'chunk', bytes: Array.from(bytes) });
    }
    onEvent.onmessage({ type: 'done' });
  } catch (error) {
    onEvent.onmessage(controller.signal.aborted
      ? { type: 'aborted' }
      : { type: 'error', message: error.message });
  } finally {
    requests.delete(request.requestId);
  }
}

async function invoke(command, args = {}) {
  if (command === 'stream_model_request') return streamFetch(args);
  if (command === 'cancel_model_stream') {
    requests.get(args.requestId)?.controller.abort();
    return true;
  }
  return invokePlatformCommand(command, args);
}

function parseCardResource(value) {
  const match = /^game-card\/([^/]*)\/(image|audio)\/(.+)$/.exec(value);
  return match ? { cardId: match[1], type: match[2], path: match[3] } : null;
}

function convertFileSrc(value) {
  const resource = parseCardResource(value);
  if (!resource) return `local://localhost/${value}`;
  const method = resource.type === 'image' ? 'getGameCardImageUrl' : 'getGameCardAudioUrl';
  return Promise.resolve(requirePlatformMock()[method](resource.cardId, resource.path))
    .then(result => result?.url ?? result);
}

function listen(_event, listener) {
  const subscribe = requirePlatformMock().onBackgroundConfigChanged;
  if (typeof subscribe !== 'function') return Promise.resolve(() => {});
  return Promise.resolve(subscribe(config => listener({ payload: { config } })));
}

module.exports = { MockChannel, convertFileSrc, invoke, listen };
