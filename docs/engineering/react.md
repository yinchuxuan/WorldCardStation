# Coding Style React

<!-- devkit:omit:start -->
适用任务：修改 React 组件或 Hook。  
相关代码：`src/renderer/`、`src/web/`。  
前置文档：[Coding Style JS](javascript.md)
<!-- devkit:omit:end -->

- **Functional components only**: Use function components with hooks; no class components.
- **Hooks at top level**: Call hooks unconditionally at the top of the component; never in loops, conditions, or nested functions.
- **One component per file**: File name matches component name in PascalCase.
- **Props with TypeScript interfaces or PropTypes**: Define prop types explicitly; destructure at the signature.
- **Minimal state**: Derive values from existing state/props instead of adding redundant state.
- **Lift state to the closest shared ancestor**: Keep state as close to its consumers as possible, but not lower.
- **`useMemo`/`useCallback` only when needed**: Don't prematurely memoize; add when profiling shows wasteful re-renders or as dependency to other hooks.
- **Custom hooks for reusable logic**: Extract shared stateful logic into `useXxx` hooks, not HOCs.
- **Keys on list items must be stable IDs**: Never use array index as `key` unless the list is truly static.
- **Colocate related logic**: Keep hook calls that belong together adjacent; split large components.
- **Controlled inputs over uncontrolled**: Use `value` + `onChange` for predictable form state; use refs only for non-React interop.
- **Side effects in `useEffect`, never in render**: Subscribe, fetch, and mutate DOM only inside effects with proper cleanup.
- **Component composition over prop drilling**: Use `children`, slots, or context before reaching for global state.
- **Error boundaries at logical boundaries**: Wrap feature sections with error boundaries to prevent full-page crashes.
- **Avoid inline object/array creation in JSX props**: Prevents new reference on every render, breaking `React.memo` and `useMemo` dependencies.
