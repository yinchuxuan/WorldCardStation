import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentHistoryTitle from '../../src/renderer/components/AgentHistoryTitle.jsx';

test('Agent badge is not a button and arrows cycle without toggling history', () => {
  const onSelect = jest.fn();
  const onToggle = jest.fn();
  const contexts = { judge: {}, narrator: {}, guide: {} };
  const tree = selected => <div onClick={onToggle}>
    <AgentHistoryTitle contexts={contexts} selected={selected} onSelect={onSelect} />
  </div>;
  const { rerender } = render(tree('judge'));
  expect(screen.queryByRole('button', { name: 'judge' })).toBeNull();
  expect(screen.getByText('judge').parentElement).toHaveClass('config-status', 'configured', 'game-card-model-status');
  fireEvent.click(screen.getByText('judge'));
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '上一个 Agent' }));
  expect(onSelect).toHaveBeenLastCalledWith('guide');
  fireEvent.click(screen.getByRole('button', { name: '下一个 Agent' }));
  expect(onSelect).toHaveBeenLastCalledWith('narrator');
  rerender(tree('guide'));
  fireEvent.click(screen.getByRole('button', { name: '下一个 Agent' }));
  expect(onSelect).toHaveBeenLastCalledWith('judge');
  expect(onToggle).not.toHaveBeenCalled();
});

test('single Agent disables navigation and no Agents hides the switcher', () => {
  const onSelect = jest.fn();
  const { rerender } = render(<AgentHistoryTitle contexts={{ narrator: {} }} onSelect={onSelect} />);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(screen.getByText('narrator')).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
  rerender(<AgentHistoryTitle contexts={{}} onSelect={onSelect} />);
  expect(screen.queryByRole('group')).toBeNull();
});
