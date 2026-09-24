import React from 'react';
import { act, render } from '@testing-library/react';
import useGameCardPresentation from '../../src/renderer/chat/useGameCardPresentation.js';
import GameCardBgmPlayer from '../../src/renderer/components/GameCardBgmPlayer.jsx';

test('restoring a saved BGM schedules playback instead of cancelling it with a simultaneous stop', async () => {
  jest.useFakeTimers();
  const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  global.platformMock.getGameCardAudioUrl.mockResolvedValue({ success: true, url: 'local:///theme.mp3' });
  let stage;
  function Harness() {
    stage = useGameCardPresentation();
    return <GameCardBgmPlayer updateRequest={stage.bgmRequest} stopToken={stage.bgmStopToken} />;
  }
  const mounted = render(<Harness />);
  try {
    await act(async () => {
      stage.restore({}); // Loading and restoring may be batched in one React render.
      stage.restore({ bgm: { card: { id: 'test', audio: { bgm: { theme: 'theme.mp3' } } },
        state: { audio: { bgm: 'theme' } } } });
    });
    await act(async () => jest.advanceTimersByTime(1000));
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => stage.restore({ bgm: null }));
    expect(pause).toHaveBeenCalled();
  } finally { mounted.unmount(); jest.clearAllTimers(); jest.useRealTimers(); play.mockRestore(); pause.mockRestore(); }
});
