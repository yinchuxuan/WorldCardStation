import React from 'react';
import { render } from '@testing-library/react';
import { applyAssistantDisplayRules } from '../../src/renderer/gameCard/displayRules.js';
import { resolveDisplayState } from '../../src/renderer/gameCard/regexTemplate.js';
import { messageDepths } from '../../src/renderer/gameCard/messageDepth.js';
import { buildReadingEntries, resolveReadingSegments } from '../../src/renderer/chat/segmentedReadingModel.js';
import MessageContent from '../../src/renderer/components/MessageContent.jsx';
import { validateGameCard } from '../../src/shared/game-card/schema/validateGameCard.js';
import validFixture from '../fixtures/game-card-import/valid-display-template/card.json';
import invalidFixture from '../fixtures/game-card-import/invalid-display-template/card.json';

const rule = { stage: 'before_markdown', type: 'regex_replace', pattern: '(x)',
  replace: [{ state: 'name' }, ':', { capture: 1 }], minDepth: 1, maxDepth: 2 };
const display = { assistant: [rule] };

test('readonly state/capture templates preserve literal native replacement strings', () => {
  const resolved = resolveDisplayState(display, { name: '$1' });
  expect(applyAssistantDisplayRules('x', resolved, 1)).toBe('$1:x');
  expect(applyAssistantDisplayRules('x', resolved, 0)).toBe('x');
  expect(applyAssistantDisplayRules('x', resolved, 2)).toBe('$1:x');
  expect(applyAssistantDisplayRules('x', resolved, 3)).toBe('x');
  expect(applyAssistantDisplayRules('x', resolved)).toBe('x');
  const native = { assistant: [{ ...rule, replace: '$1 $& {{state:name}}' }] };
  expect(applyAssistantDisplayRules('x', native, 1)).toBe('x x {{state:name}}');
  expect(display.assistant[0].replace[0]).toEqual({ state: 'name' });
});

test('depth counts real messages, including an in-progress assistant but excluding injected messages', () => {
  const messages = [{ role: 'system', content: 'system' }, { role: 'assistant', content: 'x' },
    { role: 'user', content: 'example', _meta: { visibility: 'llm_only' } },
    { role: 'assistant', content: 'book', _meta: { worldbook_scope: 'book' } },
    { role: 'user', content: 'go' }];
  expect(messageDepths(messages)).toEqual([undefined, 1, undefined, undefined, 0]);
  expect(messageDepths(messages, true)).toEqual([undefined, 2, undefined, undefined, 1]);
});

test('message rendering invalidates cached HTML on depth and state changes', () => {
  const pipeline = { markdown: { parse: jest.fn(text => text) }, sanitizer: { sanitize: text => text },
    quoteHighlighter: text => text };
  const resolved = resolveDisplayState(display, { name: 'Alice' });
  const view = render(<MessageContent content="x" role="assistant" display={resolved} depth={0} {...pipeline} />);
  expect(view.container.textContent).toBe('x');
  view.rerender(<MessageContent content="x" role="assistant" display={resolved} depth={1} {...pipeline} />);
  expect(view.container.textContent).toBe('Alice:x');
  view.rerender(<MessageContent content="x" role="assistant" display={resolveDisplayState(display, { name: 'Bob' })} depth={1} {...pipeline} />);
  expect(view.container.textContent).toBe('Bob:x');
  expect(pipeline.markdown.parse).toHaveBeenCalledTimes(3);
});

test('segmented page counts and patch boundaries use the same depth as rendered content', () => {
  const config = { assistant: [{ ...rule, minDepth: 2, maxDepth: null, replace: ['old'] }] };
  const messages = [{ id: 'a', role: 'assistant', content: 'x\n\n<state_patch>{}</state_patch>\n\nx' },
    { role: 'user', content: 'go' }, { role: 'assistant', content: 'x' }];
  const entries = buildReadingEntries(messages, false, '', 0, config);
  expect(entries[0].pageCount).toBe(resolveReadingSegments(messages[0].content, config, true, 2).length);
  expect(resolveReadingSegments(messages[0].content, config, true, 2)).toEqual(['old', 'x']);
  expect(entries[0].patches[0].boundary).toBe(1);
  const streaming = buildReadingEntries(messages, true, 'x', 1, config);
  expect(streaming.at(-1).pageCount).toBe(1);
});

test('schema accepts native templates and rejects unsafe shapes without adding any phase', () => {
  const card = { version: '1', id: 'test', name: 'test', rules: [], display };
  expect(validateGameCard(card).valid).toBe(true);
  for (const extra of [{ minDepth: -1 }, { replace: [{ source: 'arbitrary js' }] },
    { pattern: [{ capture: 1 }] }, { trimStrings: [123] }]) {
    expect(validateGameCard({ ...card, display: { assistant: [{ ...rule, ...extra }] } }).valid).toBe(false);
  }
  expect(validateGameCard({ ...card, rules: [{ when: { phase: 'request' }, then: [] }] }).valid).toBe(false);
});

test('state binding cannot traverse prototypes', () => {
  const config = { assistant: [{ ...rule, replace: [{ state: 'constructor.name' }] }] };
  expect(applyAssistantDisplayRules('x', resolveDisplayState(config, {}), 1)).toBe('');
});

test('JavaScript accepts/rejects the same display fixtures as the native importer', () => {
  expect(validateGameCard(validFixture).valid).toBe(true);
  expect(validateGameCard(invalidFixture).valid).toBe(false);
});
