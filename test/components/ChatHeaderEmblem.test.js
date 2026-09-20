import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatHeaderEmblem from '../../src/renderer/components/ChatHeaderEmblem.jsx';

test('decorative and interactive emblems share the same icon markup and sizing class', () => {
  const { container, rerender } = render(<ChatHeaderEmblem />);
  expect(container.querySelector('.game-card-title-icon')).toHaveAttribute('data-icon', 'square');
  const iconMarkup = container.querySelector('.game-card-title-icon').outerHTML;
  expect(container.firstChild).toHaveClass('chat-header-emblem');
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('button')).toBeNull();
  const onClick = jest.fn();
  rerender(<ChatHeaderEmblem buttonProps={{ 'aria-label': '开发者模式', onClick }} />);
  const button = screen.getByRole('button', { name: '开发者模式' });
  expect(button).toHaveClass('chat-header-emblem');
  expect(button).not.toHaveAttribute('aria-hidden');
  expect(button.querySelector('.game-card-title-icon').outerHTML).toBe(iconMarkup);
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
});
