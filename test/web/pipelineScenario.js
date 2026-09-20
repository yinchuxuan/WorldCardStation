import { prepareInitMessages, preparePreSendMessages, prepareAfterResponseMessages } from '../../src/renderer/gameCard/sendPipeline.js';

// Both the Node/desktop pipeline baseline and the real browser Worker run this scenario.
export async function pipelineScenario(platform) {
  const phases = [];
  const record = result => {
    if (result.error || result.trace?.errors?.length) throw new Error(result.error || result.trace.errors.join('\n'));
    phases.push({ messages: result.messages, state: result.state });
    return result;
  };
  let current = record(await prepareInitMessages({ platform, messages: [], state: {} }));
  for (const content of ['第一轮', '第二轮']) {
    current = record(await preparePreSendMessages({ platform, state: current.state,
      messages: [...current.messages, { role: 'user', content }] }));
    current = record(await prepareAfterResponseMessages({ platform, state: current.state,
      messages: [...current.messages, { role: 'assistant', content: '你好。<state_patch>{"score":7}</state_patch>' }] }));
  }
  return phases;
}
