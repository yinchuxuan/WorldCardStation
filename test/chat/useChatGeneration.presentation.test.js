import { act } from '@testing-library/react';
import generationServices from '../../src/renderer/chat/generationServices.js';
import { renderRetryGeneration } from './useChatGenerationTestHarness.js';

describe('useChatGeneration presentation effects', () => {
  const originals = { ...generationServices };

  afterEach(() => {
    Object.assign(generationServices, originals);
  });

  test('dispatches pre_send and after_response presentation effects', async () => {
    const card = { id: 'card' };
    const preState = { visual: { scene: 'school' } };
    const afterState = { visual: { portraits: { touma: 'normal' } } };
    const backgroundEffect = { type: 'visual.updateBackground' };
    const portraitEffect = { type: 'visual.updatePortrait' };
    generationServices.preparePreSendMessages = jest.fn(async ({ messages }) => ({
      applied: true,
      card,
      messages,
      state: preState,
      presentationEffects: [backgroundEffect]
    }));
    generationServices.sendChatRequest = jest.fn(async (_request, callbacks) => {
      callbacks.onToken('正文');
    });
    generationServices.prepareAfterResponseMessages = jest.fn(async ({ messages }) => ({
      applied: true,
      card,
      messages,
      state: afterState,
      presentationEffects: [portraitEffect]
    }));
    const onPresentationEffects = jest.fn();
    const { result } = renderRetryGeneration({
      options: { onPresentationEffects }
    });

    await act(async () => {
      await result.current.retry();
    });

    expect(onPresentationEffects).toHaveBeenNthCalledWith(1, [backgroundEffect], {
      card,
      phase: 'pre_send',
      state: preState
    });
    expect(onPresentationEffects).toHaveBeenNthCalledWith(2, [portraitEffect], {
      card,
      phase: 'after_response',
      state: afterState
    });
  });
});
