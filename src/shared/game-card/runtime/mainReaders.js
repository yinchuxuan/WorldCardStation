import { createReader } from './reader.js';
import { cloneJson } from '../utils/jsonValue.js';

function createMainReaders({ runtime, snapshot, idPrefix, separator, statePatchEnabled, check, fail, display, update }) {
  const readers = new Map();
  const records = cloneJson(snapshot?.records || []);
  let sequence = 0, presenting = false;
  const view = () => ({ ...runtime.view(), records: cloneJson(records) });
  function make(options) {
    check();
    try {
      const item = createReader({ source: options?.source, mode: options?.mode, separator, statePatchEnabled,
        applyPatch: runtime.applyReadingPatch, check, onError: fail });
      readers.set(item.reader, item);
      return item.reader;
    } catch (error) { fail(error); throw error; }
  }
  async function present(reader, { waitForAdvance = true } = {}) {
    check();
    const item = readers.get(reader);
    if (!item || presenting || item.presented) throw new Error('present requires an unused reader from this input');
    if (typeof waitForAdvance !== 'boolean' && typeof waitForAdvance !== 'function') throw new Error('waitForAdvance must be a boolean or function');
    presenting = true; item.presented = true;
    const record = { id: `visible-${idPrefix}${++sequence}`, role: 'assistant', content: '', mode: item.mode, units: [] };
    try {
      for (let result = await reader.next(); !result.done; result = await reader.next()) {
        check();
        const unit = result.value;
        if (!records.includes(record)) records.push(record);
        record.units.push(cloneJson(unit));
        if (unit.text) {
          record.content += `${item.mode === 'segmented' && record.content ? '\n\n' : ''}${unit.text}`;
          const wait = typeof waitForAdvance === 'function' ? waitForAdvance(unit.text) : waitForAdvance;
          if (typeof wait !== 'boolean') throw new Error('waitForAdvance must return a boolean');
          await display({ view: view(), recordId: record.id, mode: item.mode, waitForAdvance: wait });
          check();
        }
      }
      update(view(), { type: 'read-complete' });
    } catch (error) { fail(error); throw error; }
    finally { presenting = false; }
  }
  return { createReader: make, present, view,
    assertFinished() {
      if (presenting || [...readers.values()].some(item => !item.finished)) throw new Error('onInput returned with an unfinished reader');
    }
  };
}

export { createMainReaders };
