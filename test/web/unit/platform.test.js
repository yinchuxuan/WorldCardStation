import React from 'react';
import { render, screen } from '@testing-library/react';
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
    expect(Object.values(web.capabilities).every(value => value === false)).toBe(true);
    expect(web.savePolicy).toBe('manual');
    expect(Object.isFrozen(web.capabilities)).toBe(true);
  });

  const services = { ...web.rendererServices, scriptExecutor: web.gameCardPlatform.scriptExecutor,
    network: { modelFetch: web.modelFetch } };
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

test('Web startup never subscribes to native close, starts trace, or saves', () => {
  jest.resetModules();
  jest.doMock('@platform', () => web);
  jest.doMock('../../../src/web/WebCatalog.jsx', () => () => null);
  const WebApp = require('../../../src/web/WebApp.jsx').default;
  // Every Web service throws; rendering must not call any unavailable service.
  render(<WebApp />);
  expect(screen.getByRole('status')).toHaveTextContent('浏览器端已启动');
  expect(screen.getByRole('button', { name: /普通聊天/ })).toBeDisabled();
  expect(screen.queryByText(/导入卡片|开发者模式|关闭窗口/)).not.toBeInTheDocument();
  expect(global.platformMock.startSessionTrace).not.toHaveBeenCalled();
  expect(global.platformMock.saveChatHistory).not.toHaveBeenCalled();
  jest.dontMock('@platform');
  jest.dontMock('../../../src/web/WebCatalog.jsx');
});
