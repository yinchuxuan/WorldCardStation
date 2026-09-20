import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GameCardBackgroundRuntime from '../../../src/renderer/components/GameCardBackgroundRuntime.js';
import GameCardBgmPlayer from '../../../src/renderer/components/GameCardBgmPlayer.jsx';
import { imageReady } from '../../../src/web/imageReady.js';

test('image decode is awaited and failure propagates instead of replacing the scene', async () => {
  const Original = global.Image;
  let resolve;
  const decode = jest.fn(() => new Promise(done => { resolve = done; }));
  global.Image = class { decode = decode; };
  const done = jest.fn();
  const pending = imageReady(Promise.resolve('blob:image')).then(done);
  await Promise.resolve(); expect(done).not.toHaveBeenCalled();
  resolve(); await pending; expect(done).toHaveBeenCalledWith('blob:image');
  decode.mockRejectedValue(new Error('bad image'));
  await expect(imageReady('blob:bad')).rejects.toThrow('bad image');
  global.Image = Original;
});
test('failed background keeps the previous picture and can retry the same path', async () => {
  global.platformMock.getGameCardImageUrl.mockRejectedValueOnce(new Error('missing'))
    .mockResolvedValue({ success: true, url: 'local:///ok.png' });
  const changed = jest.fn();
  render(<GameCardBackgroundRuntime backgroundRequest={{ id: 1,
    card: { id: 'demo', visual: { background: { room: 'room.png' } } }, state: { visual: { scene: 'room' } } }}
  onBackgroundChange={changed} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('missing');
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('重试演出加载'));
  await waitFor(() => expect(changed).toHaveBeenCalledWith({ url: 'local:///ok.png' }));
});
test('autoplay rejection is retried synchronously from the player gesture', async () => {
  jest.useFakeTimers();
  const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('blocked')).mockResolvedValue();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  global.platformMock.getGameCardAudioUrl.mockResolvedValue({ success: true, url: 'local:///tone.wav' });
  const { unmount } = render(<GameCardBgmPlayer updateRequest={{ id: 1,
    card: { id: 'demo', audio: { bgm: { tone: 'tone.wav' } } }, state: { audio: { bgm: 'tone' } } }} />);
  await act(async () => {});
  await act(async () => { jest.advanceTimersByTime(1000); });
  fireEvent.click(screen.getByRole('button', { name: '浏览器需要手动播放 BGM' }));
  expect(play).toHaveBeenCalledTimes(2);
  await act(async () => {});
  unmount(); jest.restoreAllMocks(); jest.useRealTimers();
});
