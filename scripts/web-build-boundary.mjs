import path from 'node:path';

export function webBuildBoundary(root) {
  return {
    name: 'web-native-boundary',
    moduleParsed({ id }) {
      if (/[/\\](?:@tauri-apps|@wdio)[/\\]|[/\\]platform[/\\]tauri[^/\\]*\.js/.test(id)) {
        this.error(`Native dependency in Web build: ${id}`);
      }
    },
    generateBundle() {
      const modules = [...this.getModuleIds()]
        .filter(id => !id.startsWith('\0'))
        .map(id => path.relative(root, id).replaceAll('\\', '/')).sort();
      this.emitFile({ type: 'asset', fileName: 'module-graph.json', source: JSON.stringify(modules, null, 2) });
    }
  };
}
