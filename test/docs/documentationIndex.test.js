import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const docsRoot = path.join(root, 'docs');
const collect = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? collect(file) : file.endsWith('.md') ? [file] : [];
});
const docs = collect(docsRoot);
const withoutExamples = text => text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');

test.each(docs.map(file => [path.relative(root, file), file]))('%s has resolvable local document links', (_name, file) => {
  const text = withoutExamples(fs.readFileSync(file, 'utf8'));
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    expect({ from: file, target, exists: fs.existsSync(path.resolve(path.dirname(file), target)) })
      .toEqual({ from: file, target, exists: true });
  }
});

test('directory indexes form a complete tree without skipping levels', () => {
  const entry = path.join(docsRoot, 'docs_roadmap.md');
  const visited = new Set();
  const walk = file => {
    expect(visited.has(file)).toBe(false);
    visited.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
      const resolved = path.resolve(path.dirname(file), target);
      if (!resolved.startsWith(docsRoot + path.sep)) {
        expect(path.relative(docsRoot, file)).toBe('libraries/README.md');
        expect(path.basename(resolved)).toBe('README.md');
        expect(fs.existsSync(resolved)).toBe(true);
        continue;
      }
      const segments = path.relative(path.dirname(file), resolved).split(path.sep);
      expect(segments).not.toContain('..');
      if (segments.length === 1) {
        expect(file).not.toBe(entry);
        expect(path.basename(resolved)).not.toBe('README.md');
        expect(visited.has(resolved)).toBe(false);
        visited.add(resolved);
      } else {
        expect(segments).toHaveLength(2);
        expect(segments[1]).toBe('README.md');
        walk(resolved);
      }
    }
  };
  walk(entry);
  expect([...visited].sort()).toEqual([...docs].sort());
});

test('maintained contract metadata points to real code', () => {
  for (const file of docs.filter(file => !file.endsWith('docs_roadmap.md')
    && !file.endsWith('README.md') && !file.includes('/releases/'))) {
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('适用任务：');
    expect(text).toContain('前置文档：');
    const code = text.split('\n').find(line => line.startsWith('相关代码：'));
    expect(code).toBeDefined();
    for (const [, location] of code.matchAll(/`([^`]+)`/g)) {
      expect({ location, exists: fs.existsSync(path.join(root, location)) }).toEqual({ location, exists: true });
    }
    expect(text.trimEnd().split('\n').length).toBeLessThanOrEqual(200);
  }
});
