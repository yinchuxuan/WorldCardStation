import { parseSource, parseTransform } from '../../../shared/game-card/content/contentParser.js';
import { resolveRegisteredTextPath } from '../../../shared/game-card/content/fileScopes.js';
import { extractUniqueFileSection } from '../../../shared/game-card/content/fileSections.js';
import { parseFileRef } from '../../../shared/game-card/content/contentFiles.js';

async function checkFile(body, location, ctx) {
  const { fileRef, sectionRef } = parseFileRef(body);
  if (fileRef.startsWith('$')) {
    ctx.warn('dynamic_file_reference', '动态 file ID 和章节只能在实际游玩时确认。', location);
    return;
  }
  await ctx.check('file_reference', location, async () => {
    const file = resolveRegisteredTextPath(ctx.card, fileRef);
    if (!file) throw new Error(`unknown content file id: ${fileRef}`);
    const text = await ctx.readText(file);
    if (sectionRef.startsWith('$')) ctx.warn('dynamic_file_reference', '动态章节只能在实际游玩时确认。', location);
    else if (sectionRef) extractUniqueFileSection(text, sectionRef);
  });
}

async function checkTemplate(text, location, ctx) {
  await ctx.check('content_syntax', location, async () => {
    let cursor = 0;
    while ((cursor = text.indexOf('{{', cursor)) >= 0) {
      const source = parseSource(text, cursor);
      if (source.body.startsWith('file:')) await checkFile(source.body.slice(5), location, ctx);
      else if (source.body !== 'original_content' && !/^state(?:_json)?:/.test(source.body)) {
        throw new Error(`unsupported content source: ${source.body}`);
      }
      cursor = source.next;
      let transform;
      while ((transform = parseTransform(text, cursor))) {
        if (!['regex_replace', 'regex_extract', 'format', 'join'].includes(transform.name)) {
          throw new Error(`unsupported content transform: ${transform.name}`);
        }
        if (transform.name.startsWith('regex_')) {
          await ctx.check('regex_syntax', location, () => new RegExp(transform.args.pattern || '',
            transform.name === 'regex_replace' ? transform.args.flags || '' : ''));
        }
        cursor = transform.next;
      }
    }
  });
}

export { checkTemplate };
