const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(
  __dirname,
  '../../src/renderer/styles/components.app.css'
), 'utf8');

describe('portrait animation styles', () => {
  test('fades the portrait in after the background animation', () => {
    expect(css).toMatch(/\.app-background-layer-current\s*{[^}]*animation:\s*app-background-fade-in\s+var\(--app-background-insert-duration\)\s+linear\s+both;/s);
    expect(css).toMatch(/\.app-portrait-image\[data-transition="enter"\]\s*{[^}]*animation:\s*app-portrait-fade-in\s+var\(--app-portrait-insert-duration\)\s+linear\s+var\(--app-background-insert-duration\)\s+both;/s);
    expect(css).toMatch(/@keyframes app-portrait-fade-in\s*{\s*from\s*{\s*opacity:\s*0;\s*}\s*to\s*{\s*opacity:\s*1;\s*}\s*}/s);
  });

  test('uses a short fade without delay for expression changes', () => {
    expect(css).toMatch(/\.app-portrait-image\[data-transition="expression"\]\s*{[^}]*animation:\s*app-portrait-fade-in\s+var\(--app-portrait-expression-duration\)\s+ease-out\s+both;/s);
    expect(css).toMatch(/\.app-portrait-image\[data-transition="expression-exit"\]\s*{[^}]*animation:\s*app-portrait-fade-out\s+var\(--app-portrait-expression-exit-duration, 0ms\)\s+linear\s+both;/s);
  });

  test('defines fade-out styling for the exit transition', () => {
    expect(css).toMatch(/\.app-portrait-image\[data-transition="exit"\]\s*{[^}]*animation:\s*app-portrait-fade-out\s+var\(--app-portrait-exit-duration, 0ms\)\s+linear\s+both;/s);
    expect(css).toMatch(/@keyframes app-portrait-fade-out\s*{\s*from\s*{\s*opacity:\s*1;\s*}\s*to\s*{\s*opacity:\s*0;\s*}\s*}/s);
  });

  test('automatically positions and scales up to four portrait slots', () => {
    expect(css).toMatch(/left\s+var\(--app-portrait-layout-duration\)/);
    expect(css).toMatch(/height\s+var\(--app-portrait-layout-duration\)/);
    expect(css).toContain('.app-portrait-layer[data-count="4"] .app-portrait-slot[data-index="3"]');
  });
});
