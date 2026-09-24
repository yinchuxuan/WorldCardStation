import { createReader } from '../../src/shared/game-card/runtime/reader.js';
import { validateRuntimeDefinition } from '../../src/shared/game-card/schema/runtimeDefinitionSchema.js';
import { resolveDisplayState } from '../../src/renderer/gameCard/regexTemplate.js';
import { applyAssistantDisplayRules } from '../../src/renderer/gameCard/displayRules.js';

const text = '<state_patch>{"count":9}</state_patch><state_patch_stream>bad</state_patch_stream>'
  + '<state_patch><state_patch_stream>nested</state_patch>unfinished<state_patch';

test.each(['continuous', 'segmented'])('%s preserves malformed and complete tags across chunks when disabled', async mode => {
  for (const source of [text, (async function* () { for (const char of text) yield char; })()]) {
    const applyPatch = jest.fn();
    const { reader } = createReader({ source, mode, applyPatch, statePatchEnabled: false });
    const units = [];
    for (let item = await reader.next(); !item.done; item = await reader.next()) units.push(item.value);
    expect(units.map(unit => unit.text).join('')).toBe(text);
    expect(units.every(unit => unit.patches.length === 0)).toBe(true);
    expect(applyPatch).not.toHaveBeenCalled();
  }
});

test('display does not silently remove literal patches when the card disables interpretation', () => {
  const display = resolveDisplayState(undefined, {}, false);
  expect(applyAssistantDisplayRules(text, display)).toBe(text);
  expect(applyAssistantDisplayRules('<state_patch>hidden</state_patch>visible')).toBe('visible');
});

test('manifest accepts optional boolean configuration, rejects misspellings and non-booleans', () => {
  const card = { formatVersion: '1', version: '1', id: 'test', name: 'test', main: 'main.js', agents: { chat: 'chat.json' } };
  for (const statePatch of [undefined, {}, { enabled: false }, { enabled: true }]) {
    expect(validateRuntimeDefinition({ ...card, ...(statePatch ? { statePatch } : {}) }, 'runtimeManifest')).toEqual([]);
  }
  for (const statePatch of [false, { enabled: 'false' }, { enable: false }]) {
    expect(validateRuntimeDefinition({ ...card, statePatch }, 'runtimeManifest').length).toBeGreaterThan(0);
  }
});
