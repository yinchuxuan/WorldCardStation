import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { desktopPolicy } from '../../../src/renderer/platform/platformPolicy.js';
import { webPolicy } from '../../../src/web/platformPolicy.js';
import * as web from '../../../src/web/platform.js';
import * as desktop from '../../../src/renderer/platform/desktop.js';
import { rendererServices as selected } from '../../../src/renderer/platform/index.js';
import { modelFetch as selectedFetch } from '../../../src/renderer/platform/modelFetch.js';

describe('platform contracts', () => {
  test('desktop defaults retain capabilities and automatic saving', () => {
    expect(desktop.capabilities).toBe(desktopPolicy.capabilities);
    expect(Object.values(desktop.capabilities).every(Boolean)).toBe(true);
    expect(desktop.savePolicy).toBe('automatic');
    expect(selected).toBe(desktop.rendererServices);
    expect(selectedFetch).toBe(desktop.modelFetch);
  });

  test('Web declares only implemented capabilities and manual saving', () => {
    expect(web.capabilities).toBe(webPolicy.capabilities);
    expect(web.capabilities).toMatchObject({ gameplay: true, fullscreen: true, nativeClose: false, diskTrace: false });
    expect(web.savePolicy).toBe('manual');
    expect(Object.isFrozen(web.capabilities)).toBe(true);
  });

  const services = { cards: Object.fromEntries(Object.entries(web.rendererServices.cards).filter(([key]) => !['list', 'setActive'].includes(key))), trace: web.rendererServices.trace,
    development: web.rendererServices.development };
  Object.entries(services).forEach(([group, methods]) => {
    Object.entries(methods).forEach(([name, method]) => {
      test(`${group}.${name} fails explicitly instead of pretending success`, () => {
        expect(method).toThrow(/Web 端暂不支持/);
        try { method(); } catch (error) {
          expect(error.code).toBe('PLATFORM_UNAVAILABLE');
          expect(error.operation).toContain(name);
        }
      });
    });
  });
});

test('Web resources require an active prepared card and repository starts empty', async () => {
  await expect(web.gameCardPlatform.repository.getActiveCard()).resolves.toBeNull();
  Object.values(web.gameCardPlatform.resources).forEach(method => expect(() => method('demo', 'file.txt')).toThrow('尚未就绪'));
});

test('Web shared App never subscribes to native close, starts trace, or saves', async () => {
  jest.resetModules();
  jest.doMock('react', () => React);
  jest.doMock('@platform', () => web);
  window.matchMedia = jest.fn(() => ({ matches: false }));
  jest.spyOn(web.rendererServices.config, 'load').mockResolvedValue({});
  jest.spyOn(web.rendererServices.background, 'load').mockResolvedValue({ backgroundImageUrl: '', backgroundOpacity: 0.5 });
  const WebApp = require('../../../src/web/WebApp.jsx').default;
  const { container, unmount } = render(<WebApp />);
  await waitFor(() => expect(screen.getByRole('button', { name: '切换游戏卡' })).toBeEnabled());
  expect(container.querySelector('.settings-panel')).not.toBeNull();
  expect(screen.queryByText(/记住密钥|清除密钥|切换全屏/)).not.toBeInTheDocument();
  expect(container.querySelector('.app-container')).not.toBeNull();
  expect(screen.queryByText(/导入卡片|开发者模式|关闭窗口/)).not.toBeInTheDocument();
  expect(global.platformMock.startSessionTrace).not.toHaveBeenCalled();
  expect(global.platformMock.saveChatHistory).not.toHaveBeenCalled();
  jest.dontMock('@platform');
  unmount(); jest.restoreAllMocks();
});

test('browser fullscreen delegates to DOM APIs and reports unsupported browsers', async () => {
  await expect(web.rendererServices.window.isFullscreen()).resolves.toBe(false);
  await expect(web.rendererServices.window.setFullscreen(true)).rejects.toThrow('不支持');
  document.documentElement.requestFullscreen = jest.fn().mockResolvedValue();
  document.exitFullscreen = jest.fn().mockResolvedValue();
  await web.rendererServices.window.setFullscreen(true);
  expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
  await expect(web.rendererServices.window.isFullscreen()).resolves.toBe(true);
  await web.rendererServices.window.setFullscreen(false);
  expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  delete document.fullscreenElement; delete document.documentElement.requestFullscreen; delete document.exitFullscreen;
});
