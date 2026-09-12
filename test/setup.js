// Jest DOM setup
require('@testing-library/jest-dom');

// Polyfill ReadableStream and TextEncoder for jsdom environment
const { ReadableStream } = require('stream/web');
global.ReadableStream = ReadableStream;
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const mockTauriApi = require('./tauriApiMock.js');
const { invalidateGameCardRuntimeCache } = require('../src/renderer/gameCard/gameCardRuntimeCache.js');

beforeEach(() => invalidateGameCardRuntimeCache());

jest.mock('@tauri-apps/api/core', () => ({
  Channel: mockTauriApi.MockChannel,
  convertFileSrc: mockTauriApi.convertFileSrc,
  invoke: mockTauriApi.invoke
}));
jest.mock('@tauri-apps/api/event', () => ({ listen: mockTauriApi.listen }));
jest.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    destroy: jest.fn().mockResolvedValue(undefined),
    isFullscreen: jest.fn().mockResolvedValue(false),
    onCloseRequested: jest.fn().mockResolvedValue(jest.fn()),
    setFullscreen: jest.fn().mockResolvedValue(undefined)
  })
}));

// Mock native commands used through the Tauri renderer adapter.
global.platformMock = {
  startSessionTrace: jest.fn().mockResolvedValue({ token: 'trace', path: '/data/trace.jsonl' }),
  appendSessionTrace: jest.fn().mockResolvedValue(undefined),
  closeSessionTrace: jest.fn().mockResolvedValue(undefined),
  getGameCardDevelopmentInstructions: jest.fn().mockResolvedValue('游戏卡开发指令'),
  getModelConfig: jest.fn(),
  saveModelConfig: jest.fn(),
  getBackgroundConfig: jest.fn(),
  saveBackgroundConfig: jest.fn(),
  selectBackgroundImage: jest.fn(),
  getChatHistory: jest.fn().mockResolvedValue({ success: true, messages: [] }),
  saveChatHistory: jest.fn().mockResolvedValue({ success: true }),
  listChatSessions: jest.fn().mockResolvedValue({ success: true, sessions: [], activeId: null }),
  getActiveChatSession: jest.fn().mockResolvedValue({ success: true, session: null }),
  createChatSession: jest.fn().mockResolvedValue({ success: true, id: 'session-test' }),
  setActiveChatSession: jest.fn().mockResolvedValue({ success: true }),
  renameChatSession: jest.fn().mockResolvedValue({ success: true }),
  deleteChatSession: jest.fn().mockResolvedValue({ success: true }),
  getGameCards: jest.fn().mockResolvedValue({ success: true, cards: [] }),
  importGameCardFromDirectory: jest.fn().mockResolvedValue({ success: false, canceled: true, card: null }),
  importGameCardFromFile: jest.fn().mockResolvedValue({ success: false, canceled: true, card: null }),
  setActiveGameCard: jest.fn().mockResolvedValue({ success: true }),
  deleteGameCard: jest.fn().mockResolvedValue({ success: true }),
  getActiveGameCard: jest.fn().mockResolvedValue({ success: true, card: null }),
  readGameCardFile: jest.fn().mockResolvedValue({ success: true, content: '' }),
  getGameCardAudioUrl: jest.fn().mockResolvedValue({ success: true, url: 'local:///audio.mp3' }),
  getGameCardImageUrl: jest.fn().mockResolvedValue({ success: true, url: 'local:///background.jpg' }),
  onBackgroundConfigChanged: jest.fn()
};

// Mock fetch for ChatPanel API calls
global.fetch = jest.fn();

// Import and expose streaming mock helpers as globals
const streamingMocks = require('./streamingMocks.js');
global.createStreamingMock = streamingMocks.createStreamingMock;
global.createThinkingStreamingMock = streamingMocks.createThinkingStreamingMock;
global.createSimpleStreamingMock = streamingMocks.createSimpleStreamingMock;
global.createAnthropicStreamingMock = streamingMocks.createAnthropicStreamingMock;
global.createAnthropicThinkingStreamingMock = streamingMocks.createAnthropicThinkingStreamingMock;
