const NAMES = ['state_patch', 'state_patch_stream'];
const TAGS = NAMES.flatMap(name => [`<${name}>`, `</${name}>`]);

// Incremental lexer: retain only a possible tag prefix, never expose it to the UI.
function createReaderTokenizer() {
  let buffer = '', open, body = '';
  function feed(text, final = false) {
    buffer += text;
    const tokens = [];
    function emit(value) {
      if (!value) return;
      if (open) body += value;
      else tokens.push({ type: 'text', text: value });
    }
    while (buffer) {
      const index = buffer.indexOf('<');
      if (index < 0) { emit(buffer); buffer = ''; break; }
      if (index > 0) { emit(buffer.slice(0, index)); buffer = buffer.slice(index); }
      const tag = TAGS.find(value => buffer.startsWith(value));
      if (tag) {
        const name = tag.replace(/[<>/]/g, '');
        if (tag.startsWith('</')) {
          if (open !== name) throw new Error('unmatched state patch tag');
          tokens.push({ type: open, text: body });
          open = undefined; body = '';
        } else {
          if (open) throw new Error('nested state patch tags');
          open = name;
        }
        buffer = buffer.slice(tag.length);
      } else if (TAGS.some(value => value.startsWith(buffer))) {
        if (final) {
          if (buffer.length > 2) throw new Error('unclosed state patch tag prefix');
          emit(buffer); buffer = '';
        }
        break;
      } else { emit('<'); buffer = buffer.slice(1); }
    }
    if (final && open) throw new Error('unclosed state patch tag');
    return tokens;
  }
  return { feed };
}

async function* readerTokens(source) {
  const tokenizer = createReaderTokenizer();
  const chunks = typeof source === 'string' ? [source] : source;
  let cr = false;
  for await (let chunk of chunks) {
    if (typeof chunk !== 'string') throw new Error('reader source must yield strings');
    if (!chunk) continue;
    if (cr) { chunk = `\r${chunk}`; cr = false; }
    if (chunk.endsWith('\r')) { cr = true; chunk = chunk.slice(0, -1); }
    yield* tokenizer.feed(chunk.replace(/\r\n?/g, '\n'));
  }
  yield* tokenizer.feed(cr ? '\n' : '', true);
}

export { createReaderTokenizer, readerTokens };
