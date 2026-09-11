import { createUiRootFactory } from '../../shared/game-card/exec/uiCompilation.js';
import { readCachedCardText } from './gameCardRuntimeCache.js';

const UI_ROOT_SOURCE_PATTERN = /^(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$)).+\.jsx?$/i;

function isSafeUiRootSourcePath(path) {
  return typeof path === 'string' && UI_ROOT_SOURCE_PATTERN.test(path);
}


function isReactComponent(value) {
  return typeof value === 'function' || (!!value && typeof value === 'object' && value.$$typeof);
}

function pickComponent(result) {
  const candidates = [
    result.moduleExport?.default,
    result.moduleExport?.Root,
    result.exportsValue?.default,
    result.exportsValue?.Root,
    result.namedRoot,
    result.moduleExport
  ];
  return candidates.find(isReactComponent);
}

function compileGameCardUiRootSource(source, ReactRef) {
  const moduleObj = { exports: {} };
  const exportsObj = moduleObj.exports;
  const factory = createUiRootFactory(source);
  const component = pickComponent(factory(ReactRef, moduleObj, exportsObj));
  if (!component) throw new Error('ui root source must export or define a React component named Root');
  return component;
}

async function loadGameCardUiRoot(card, resources, ReactRef) {
  const root = card?.ui?.root;
  if (!card?.id || !root || !isSafeUiRootSourcePath(root.source) || typeof resources?.readText !== 'function') {
    return null;
  }
  const content = await readCachedCardText(card, resources, root.source);
  if (!content) throw new Error('failed to read ui root source');
  return {
    Component: compileGameCardUiRootSource(content, ReactRef),
    props: root.props || {},
    source: root.source
  };
}

export {
  compileGameCardUiRootSource,
  isSafeUiRootSourcePath,
  loadGameCardUiRoot
};
