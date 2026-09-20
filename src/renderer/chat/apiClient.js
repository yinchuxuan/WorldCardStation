import { buildAnthropicParams, buildOpenAIParams } from './modelGenerationParams.js';
import { adaptMessagesToProtocol } from '../../shared/game-card/protocol/protocolAdapter.js';
import { createSSEParser } from './sseParser.js';
import { modelFetch } from '../platform/modelFetch.js';

function normalizeUrl(url) {
  return url.replace(/\/+$/, '').replace(/\/v1$/, '');
}

function buildOpenAIRequest(config) {
  const adapted = adaptMessagesToProtocol(config.messages, 'openai');
  return {
    url: `${normalizeUrl(config.apiUrl)}/v1/chat/completions`,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.modelName || 'gpt-3.5-turbo', messages: adapted.messages,
        stream: true, ...buildOpenAIParams(config)
      })
    }
  };
}

function buildAnthropicRequest(config) {
  const adapted = adaptMessagesToProtocol(config.messages, 'anthropic');
  const body = {
    model: config.modelName || 'claude-sonnet-4-20250514',
    messages: adapted.messages, stream: true, ...buildAnthropicParams(config)
  };
  if (adapted.system) body.system = adapted.system;
  return {
    url: `${normalizeUrl(config.apiUrl)}/v1/messages`,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    }
  };
}

function buildRequest(config) {
  const protocol = config.protocol || 'openai';
  const request = protocol === 'anthropic' ? buildAnthropicRequest(config) : buildOpenAIRequest(config);
  if (config.signal) request.options.signal = config.signal;
  return { protocol, ...request };
}

function reasoningDetailText(detail) {
  if (detail?.type === 'reasoning.text' && typeof detail.text === 'string') return detail.text;
  if (detail?.type !== 'reasoning.summary') return '';
  if (typeof detail.summary === 'string') return detail.summary;
  if (!Array.isArray(detail.summary)) return '';
  return detail.summary.map(item => typeof item === 'string' ? item : (item?.text || '')).join('');
}

function openAIReasoningText(delta) {
  const direct = [delta?.reasoning_content, delta?.reasoning]
    .find(value => typeof value === 'string' && value);
  if (direct) return direct;
  if (!Array.isArray(delta?.reasoning_details)) return '';
  return delta.reasoning_details.map(reasoningDetailText).join('');
}

async function emitProviderChunk(parsed, protocol, callbacks) {
  if (parsed.error || parsed.type === 'error') {
    throw new Error(parsed.error?.message || parsed.error?.error?.message || parsed.message || 'Provider stream error');
  }
  if (protocol === 'anthropic') {
    if (parsed.type !== 'content_block_delta') return;
    if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
      await callbacks.onToken?.(parsed.delta.text);
    }
    if (parsed.delta?.type === 'thinking_delta' && parsed.delta.thinking) {
      await callbacks.onThinkingToken?.(parsed.delta.thinking);
    }
    return;
  }
  const delta = parsed.choices?.[0]?.delta;
  const reasoning = openAIReasoningText(delta);
  if (reasoning) await callbacks.onThinkingToken?.(reasoning);
  if (delta?.content) await callbacks.onToken?.(delta.content);
}

async function parseProviderEvent(event, protocol, callbacks) {
  if (event.data === '[DONE]') return;
  if (event.type === 'error') {
    await emitProviderChunk(JSON.parse(event.data), protocol, callbacks);
    throw new Error(event.data || 'Provider stream error');
  }
  let parsed;
  try { parsed = JSON.parse(event.data); }
  catch {
    const lines = event.data.split('\n').filter(Boolean);
    if (lines.length > 1) {
      for (const data of lines) {
        await parseProviderEvent({ type: event.type, data }, protocol, callbacks);
      }
      return;
    }
    throw new Error(`Invalid SSE data: ${event.data.slice(0, 80)}`);
  }
  await emitProviderChunk(parsed, protocol, callbacks);
}

async function readSSEStream(reader, protocol, callbacks) {
  const decoder = new TextDecoder();
  let eventQueue = Promise.resolve();
  const parser = createSSEParser(event => {
    eventQueue = eventQueue.then(() => parseProviderEvent(event, protocol, callbacks));
  });
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (!done) {
      parser.feed(decoder.decode(chunk.value, { stream: true }));
      await eventQueue;
    }
  }
  parser.feed(decoder.decode());
  parser.end();
  await eventQueue;
}

async function sendChatRequest(config, callbacks = {}) {
  const { url, options, protocol } = buildRequest(config);
  const response = await modelFetch(url, options);
  if (!response.ok) {
    let message = `API 错误: ${response.status}`;
    try { message = (await response.json())?.error?.message || message; } catch { /* keep status */ }
    throw new Error(message);
  }
  if (!response.body?.getReader) throw new Error('API response body is empty');
  const reader = response.body.getReader();
  try { await readSSEStream(reader, protocol, callbacks); }
  finally {
    reader.releaseLock();
    response.dispose?.();
  }
}

export { readSSEStream, sendChatRequest };
