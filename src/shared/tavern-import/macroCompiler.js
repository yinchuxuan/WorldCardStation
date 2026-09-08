import { codeLiteral as literal, parseTemplate, splitArguments } from './macroParser.js';
import { issue } from './validation.js';

function macroExpression(node, context, nested = false) {
  const { name, argument, separator } = node;
  const { report, location, readOnly, variables, options } = context;
  const unknown = () => {
    issue(report, 'unsupported_macro', `${location}:${node.start}`, `未支持的宏保持原文且不执行其内部内容：${node.raw.slice(0, 120)}`);
    return literal(node.raw);
  };
  if (node.unsupported) return unknown();
  const at = { ...context, location: `${location}:${node.start}` };
  const compileArgument = text => compileInline(text, at);
  if (['//', 'comment'].includes(name)) return '""';
  if (argument === undefined) {
    if (name === 'original' && options.original !== undefined) {
      return compileInline(options.original, { ...at, options: { ...options, original: undefined } });
    }
    const simple = {
      char: 'ctx.state.__tavern.character', user: 'ctx.state.__tavern.user',
      newline: '"\\n"', noop: '""', trim: undefined,
      lastmessage: '(tavernHistory(ctx.messages).slice(-1)[0]?.content ?? "")',
      lastusermessage: '(tavernHistory(ctx.messages).filter(m => m.role === "user").slice(-1)[0]?.content ?? "")',
      lastcharmessage: '(tavernHistory(ctx.messages).filter(m => m.role === "assistant").slice(-1)[0]?.content ?? "")'
    };
    if (Object.hasOwn(simple, name) && simple[name] !== undefined) return simple[name];
  }
  if (name === 'outlet' && argument !== undefined && !readOnly && !nested && !argument.includes('{{')) {
    return `{outlet:${literal(argument.trim())}}`;
  }
  if (name === 'reverse' && argument !== undefined) return `Array.from(${compileArgument(argument)}).reverse().join("")`;
  if (['random', 'pick'].includes(name) && argument !== undefined) {
    const choices = splitArguments(argument, separator === '::' ? '::' : ',').map(value => value.trim());
    if (!choices.length || choices.length > 256) return unknown();
    // Only literals/read-only arguments: unchosen options must never write variables.
    const values = choices.map(value => compileInline(value, { ...at, readOnly: true }));
    const index = name === 'random' ? `ctx.utils.randomInt(0,${choices.length - 1})`
      : `tavernPick(ctx.state.__tavern.seed,${literal(`${location}:${node.start}`)},${choices.length})`;
    return `[${values.join(',')}][${index}]`;
  }
  if (name === 'roll' && argument !== undefined) {
    const dice = argument.trim();
    const match = /^(\d*)d(\d+)$/i.exec(dice);
    if (match && Number(match[1] || 1) > 0 && Number(match[1] || 1) <= 100 && Number(match[2]) > 0 && Number(match[2]) <= 1000000) {
      return `String(ctx.utils.roll(${literal(dice)}))`;
    }
    return unknown();
  }
  if (['getvar', 'setvar', 'addvar', 'incvar', 'decvar'].includes(name) && argument !== undefined) {
    const args = splitArguments(argument);
    const key = args[0].trim();
    const writing = name !== 'getvar';
    if (!key || key.includes('{{') || (writing && readOnly)
      || args.length !== (['setvar', 'addvar'].includes(name) ? 2 : 1)) return unknown();
    if (!variables.has(key)) variables.set(key, `v${variables.size}`);
    const safeKey = literal(variables.get(key));
    const vars = 'ctx.state.__tavern.variables';
    if (name === 'getvar') return `String(tavernGet(${vars},${safeKey}))`;
    if (name === 'setvar') return `(${vars}[${safeKey}]=${compileArgument(args[1])},"")`;
    if (name === 'addvar') return `(tavernAdd(${vars},${safeKey},${compileArgument(args[1])}),"")`;
    return `String(tavernAdd(${vars},${safeKey},${name === 'incvar' ? 1 : -1}))`;
  }
  return unknown();
}

function compileInline(text, context) {
  return `[${parseTemplate(text).map(node => node.text !== undefined
    ? literal(node.text) : macroExpression(node, context, true)).join(',')}].join("")`;
}

export function createTextCompiler(report, output) {
  const functions = [];
  const entries = [];
  const variables = new Map();
  const compile = (key, text, options = {}) => {
    if (/<%|\{\{\s*(?:getglobalvar|setglobalvar)/i.test(text)) {
      issue(report, 'external_template', key, 'EJS/全局变量等模板不执行，保留文本；需要的运行环境未导入');
    }
    if (!text.includes('{{')) return;
    const name = `tavernText${functions.length}`;
    const context = { report, variables, location: key, readOnly: options.readOnly, options };
    const operations = parseTemplate(text).map(node => {
      if (node.name === 'hidden_key' && node.argument !== undefined) {
        return `s.push(${compileInline(node.argument, { ...context, readOnly: true })});`;
      }
      const value = node.text !== undefined ? literal(node.text) : macroExpression(node, context);
      return `{const v=${value};p.push(v);s.push(v);}`;
    });
    functions.push(`function ${name}(raw,ctx){if(raw!==${literal(text)})throw new Error(${literal(`文本已修改，请重新转换：${key}`)});const p=[],s=[];${operations.join('')}return {pieces:p,scanPieces:s};}`);
    entries.push(`${literal(key)}:${name}`);
  };
  const finish = () => {
    const includes = [];
    for (let index = 0; index < functions.length; index += 80) {
      const name = `render-${index / 80}.js`;
      output[`scripts/${name}`] = functions.slice(index, index + 80).join('\n');
      includes.push(`include("./${name}");`);
    }
    output['scripts/render.js'] = [...includes, `const tavernRenderers={${entries.join(',')}};`,
      'function tavernRender(key,raw,ctx){return tavernRenderers[key]?.(raw,ctx) ?? {pieces:[raw],scanPieces:[raw]};}'].join('\n');
    return Object.fromEntries(variables);
  };
  const variable = key => {
    if (!variables.has(key)) variables.set(key, `v${variables.size}`);
    return variables.get(key);
  };
  return { compile, finish, variable };
}
