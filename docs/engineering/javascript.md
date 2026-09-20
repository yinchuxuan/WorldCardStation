# Coding Style JS

<!-- devkit:omit:start -->
适用任务：修改 JavaScript 模块。  
相关代码：`src/`、`scripts/`、`test/`。  
前置文档：[Coding Rules](coding_rules.md)
<!-- devkit:omit:end -->

- **Use `const` by default, `let` when needed, never `var`**: `const` signals immutability intent; `var` has function-scope leakage.
- **Prefer strict equality `===` and `!==`**: Avoids implicit type coercion bugs.
- **Use arrow functions for callbacks, named functions for exports**: Arrows preserve lexical `this`; named exports improve stack traces.
- **Destructure at the call site**: Destructure parameters or return values at the top of a function to document shape.
- **Async/await over raw promises**: Keep control flow linear and errors catchable with `try/catch`.
- **Handle rejected promises**: Always `await` async calls or attach `.catch()`; unhandled rejections crash Node.
- **Use optional chaining `?.` and nullish coalescing `??`**: Replace defensive `&&` chains safely.
- **ES modules over CommonJS**: Use `import`/`export` for static analysis, tree-shaking, and consistent tooling.
- **Template literals over string concatenation**: More readable and support multi-line strings.
- **No magic numbers/strings**: Extract to named constants at the top of the file.
- **Spread over `Object.assign`**: `{ ...defaults, ...overrides }` is cleaner and immutable.
- **Array methods over `for` loops**: Use `map`, `filter`, `reduce` for transformations; `for...of` when side effects are needed.
- **Never mutate function defaults**: Default parameters should be primitives or freshly created objects.
- **Use `throw Error('msg')` not bare strings**: Stack traces require Error instances.
- **One expression per line in chains**: Break `.map().filter()` chains across lines for readability.
