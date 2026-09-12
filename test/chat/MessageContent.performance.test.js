const React = require('react');
const PropTypes = require('prop-types');
const { act, render } = require('@testing-library/react');
const MessageContent = require('../../src/renderer/components/MessageContent.jsx').default;
const useTypewriter = require('../../src/renderer/chat/useTypewriter.js').default;

function createPipeline() {
  return {
    markdown: { parse: jest.fn(content => `<p>${content}</p>`) },
    sanitizer: { sanitize: jest.fn(content => content) },
    quoteHighlighter: jest.fn(content => content)
  };
}

describe('MessageContent rendering performance', () => {
  test('caches completed HTML by content, role, and display revision', () => {
    const pipeline = createPipeline();
    const display = { user: [] };
    const view = render(<MessageContent content="history" role="user" display={display}
      displayRevision="display-1" {...pipeline} />);

    view.rerender(<MessageContent content="history" role="user" display={{ user: [] }}
      displayRevision="display-1" {...pipeline} />);
    expect(pipeline.markdown.parse).toHaveBeenCalledTimes(1);

    view.rerender(<MessageContent content="history" role="user" display={display}
      displayRevision="display-2" {...pipeline} />);
    expect(pipeline.markdown.parse).toHaveBeenCalledTimes(2);

    view.rerender(<MessageContent content="history" role="assistant" display={display}
      displayRevision="display-2" {...pipeline} />);
    expect(pipeline.markdown.parse).toHaveBeenCalledTimes(3);
  });

  test('does not reparse completed history when streaming content changes', () => {
    const pipeline = createPipeline();
    function MessagePair({ stream }) {
      return <><MessageContent content="completed history" role="assistant"
        displayRevision="display-1" {...pipeline} />
      <MessageContent content={stream} role="assistant"
        displayRevision="display-1" {...pipeline} /></>;
    }
    MessagePair.propTypes = { stream: PropTypes.string.isRequired };
    const view = render(<MessagePair stream="a" />);

    view.rerender(<MessagePair stream="ab" />);
    view.rerender(<MessagePair stream="abc" />);

    const historyParses = pipeline.markdown.parse.mock.calls
      .filter(([content]) => content === 'completed history');
    expect(historyParses).toHaveLength(1);
  });

  test('depth changes do not reparse cards that have no depth-dependent display rules', () => {
    const pipeline = createPipeline();
    const view = render(<MessageContent content="history" role="assistant" depth={0} {...pipeline} />);
    view.rerender(<MessageContent content="history" role="assistant" depth={1} {...pipeline} />);
    expect(pipeline.markdown.parse).toHaveBeenCalledTimes(1);
  });

  test('batches 3000 single-character tokens into bounded Markdown parses', () => {
    jest.useFakeTimers();
    const pipeline = createPipeline();
    let typewriter;
    function StreamingHarness() {
      typewriter = useTypewriter();
      return <MessageContent content={typewriter.streamContent} role="assistant"
        displayRevision="display-1" {...pipeline} />;
    }
    const view = render(<StreamingHarness />);

    act(() => { typewriter.startStreaming(); });
    for (let index = 0; index < 3000; index += 1) {
      act(() => { typewriter.pushContent('字'); });
    }
    act(() => { jest.advanceTimersByTime(50); });

    expect(typewriter.streamContent).toHaveLength(3000);
    expect(typewriter.getAccumulatedContent()).toHaveLength(3000);
    expect(pipeline.markdown.parse.mock.calls.length).toBeLessThan(40);
    view.unmount();
    jest.useRealTimers();
  });
});
