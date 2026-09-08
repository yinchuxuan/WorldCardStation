import React from 'react';
import { render } from '@testing-library/react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { runtime, source } from './runtime.js';
import MessageContent from '../../src/renderer/components/MessageContent.jsx';

const regex = replaceString => ({ placement: [2], markdownOnly: true, findRegex: '(x)', replaceString });

test('extracts and scopes static CSS, including independent animation names', () => {
  const converted = runtime(source({ extensions: { regex_scripts: [regex(
    '<style>@keyframes pulse{from{opacity:0}to{opacity:1}} .box{color:red}@media (max-width:600px){.box{color:blue}}</style><div class="box" style="animation:pulse 1s">$1</div>'
  ), regex('<style>@keyframes pulse{from{opacity:1}to{opacity:0}}</style><b style="animation-name:pulse">$1</b>')] } }));
  expect(converted.report.every(item => item.severity === 'info')).toBe(true);
  expect(converted.card.display.stylesheet).toBe('assets/regex.css');
  const css = converted.files['assets/regex.css'];
  expect(css).toContain('.game-card-theme-tavern-test [data-gc-part="message-content"] .box{color:red}');
  expect(css).toContain('@keyframes gc-tavern-test-r0-pulse');
  expect(css).toContain('@keyframes gc-tavern-test-r1-pulse');
  expect(JSON.stringify(converted.card.display.assistant[0].replace)).not.toContain('<style>');
  expect(JSON.stringify(converted.card.display.assistant[0].replace)).toContain('animation:gc-tavern-test-r0-pulse');
});

test('unsafe styles are removed with a specific warning while HTML stays sanitized', () => {
  const converted = runtime(source({ extensions: { regex_scripts: [regex(
    '<style>@import "https://example.com/a.css";</style><div style="background:url(https://example.com/a.png)" onclick="alert(1)">$1<script>alert(2)</script><img src="x" onerror="alert(3)"></div>'
  )] } }));
  expect(converted.report.filter(item => item.code === 'regex_style_unsupported')).toHaveLength(2);
  expect(converted.card.ui).toBeUndefined();
  expect(converted.files['scripts/regex.js']).toBeUndefined();
  const view = render(<MessageContent content="x" role="assistant" display={converted.card.display}
    markdown={marked} sanitizer={DOMPurify} quoteHighlighter={text => text} depth={0} />);
  expect(view.container.textContent).toBe('x');
  const html = view.container.innerHTML;
  expect(html).not.toMatch(/onclick|onerror|<script|example\.com/);
});
