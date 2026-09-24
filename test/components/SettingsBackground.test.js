const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
const SettingsBackground = require('../../src/renderer/components/SettingsBackground.jsx').default;

function mount(backgroundImageUrl = '') {
  const props = {
    backgroundConfig: { backgroundImageUrl, backgroundOpacity: 0.5 },
    onSelectBackgroundImage: jest.fn(), onClearBackgroundImage: jest.fn(), onBackgroundChange: jest.fn()
  };
  const view = render(React.createElement(SettingsBackground, props));
  return { ...view, props };
}

test('selects from the empty state, previews the selected image and allows replacement', () => {
  const { props, rerender } = mount();
  expect(screen.queryByAltText('背景预览')).not.toBeInTheDocument();
  expect(screen.queryByTitle('清除背景图片')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('未设置背景图片'));
  expect(props.onSelectBackgroundImage).toHaveBeenCalledTimes(1);

  rerender(React.createElement(SettingsBackground, {
    ...props, backgroundConfig: { backgroundImageUrl: 'selected.png', backgroundOpacity: 0.7 }
  }));
  expect(screen.getByAltText('背景预览')).toHaveAttribute('src', 'selected.png');
  expect(screen.getByText('已设置')).toBeInTheDocument();
  expect(screen.getByText('70%')).toBeInTheDocument();
  fireEvent.click(screen.getByAltText('背景预览'));
  expect(props.onSelectBackgroundImage).toHaveBeenCalledTimes(2);
});

test('clearing an image does not also open the image picker', () => {
  const { props } = mount('selected.png');
  fireEvent.click(screen.getByTitle('清除背景图片'));
  expect(props.onClearBackgroundImage).toHaveBeenCalledTimes(1);
  expect(props.onSelectBackgroundImage).not.toHaveBeenCalled();
});

test('edits opacity as a percentage and commits the fraction only on blur', () => {
  const { props } = mount('selected.png');
  fireEvent.click(screen.getByText('50%'));
  const slider = screen.getByRole('slider');
  expect(slider).toHaveAttribute('min', '0');
  expect(slider).toHaveAttribute('max', '100');
  fireEvent.change(slider, { target: { value: '80' } });
  expect(props.onBackgroundChange).not.toHaveBeenCalled();
  fireEvent.blur(slider);
  expect(props.onBackgroundChange).toHaveBeenCalledWith('backgroundOpacity', 0.8);
});
