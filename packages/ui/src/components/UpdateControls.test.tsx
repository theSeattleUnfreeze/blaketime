import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UpdateControls } from './UpdateControls';
import type { UpdatesModel } from '../use-updates';
afterEach(cleanup);
function model(phase: 'available' | 'disabled'): UpdatesModel {
  return { status: { phase, version: '0.2.0', progress: null, automatic: true }, error: null, pending: false, prompt: false, dismiss: vi.fn(), check: vi.fn(), install: vi.fn(), setAutomatic: vi.fn() };
}
it('does not install without an explicit click', () => {
  const updates = model('available');
  render(<UpdateControls model={updates} />);
  expect(updates.install).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Install update and restart' }));
  expect(updates.install).toHaveBeenCalledOnce();
});
it('does not imply updates are configured in developer builds', () => {
  render(<UpdateControls model={model('disabled')} />);
  expect((screen.getByRole('button', { name: 'Check for updates' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Updates are unavailable in this development build.')).toBeTruthy();
});
