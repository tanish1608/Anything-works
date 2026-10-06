import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as http from '../api/client';
import AgentIsle from '../workspace/AgentIsle';

let deferred: Promise<void> | null;
beforeEach(() => {
  localStorage.clear(); deferred = null;
  vi.spyOn(http, 'api').mockImplementation(async (path, init = {}) => {
    if (path === '/auth/login') return { access_token: 'test', refresh_token: 'refresh' };
    if (path === '/auth/me') return { id: 'worker', name: 'Worker', email: 'worker@example.com' };
    if (path === '/auth/logout') return undefined;
    if (path === '/projects') return [{ id: 'shared', name: 'Connected project' }, { id: 'other', name: 'Other project' }];
    if (path.endsWith('/agent/chat')) {
      const body = init.json as { input_revision: string; page: string; display_context: string };
      expect(body.display_context).toContain('Local sample');
      if (deferred) await deferred;
      return { input_revision: body.input_revision, status: 'available', message: 'Collect a clear view of the pipe connection.',
        sources: [{ kind: 'model', locator: 'component:sink', id: 'version', revision: 'version', sha256: 'a'.repeat(64) }],
        suggested_questions: ['Which photo should I take?'], partial_context: true };
    }
    throw new Error(`Unexpected request ${path}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
const context = { page: 'record' as const, label: 'Work record', displayContext: 'Local sample: sink awaiting review' };
async function connect() {
  fireEvent.click(screen.getByRole('button', { name: /Agent Isle/ }));
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'worker@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect project' }));
  await screen.findByRole('option', { name: 'Connected project' });
  fireEvent.change(screen.getByLabelText('Connected project'), { target: { value: 'shared' } });
  await screen.findByLabelText('Ask Agent Isle');
}

it('opens in place without network calls until activated, connects and sends current context', async () => {
  render(<AgentIsle {...context} />);
  expect(http.api).not.toHaveBeenCalled();
  await connect();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Ask Agent Isle'), { target: { value: 'How should I check this?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Collect a clear view of the pipe connection.');
  expect(http.api).toHaveBeenCalledWith('/projects/shared/agent/chat', expect.objectContaining({ method: 'POST', json: expect.objectContaining({ page: 'record' }) }));
  fireEvent.click(screen.getByRole('button', { name: 'Which photo should I take?' }));
  expect(screen.getByLabelText('Ask Agent Isle')).toHaveValue('Which photo should I take?');
  const chats = vi.mocked(http.api).mock.calls.filter(([path]) => path.endsWith('/agent/chat'));
  expect(chats).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Agent Isle/ }));
  expect(screen.queryByRole('log')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Agent Isle/ }));
  expect(screen.getByText('Collect a clear view of the pipe connection.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear conversation' }));
  expect(screen.queryByText('Collect a clear view of the pipe connection.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('button', { name: 'Connect project' });
  expect(http.tokenStore.get()).toBeNull();
});

it('discards late answers when the surrounding page changes', async () => {
  const view = render(<AgentIsle {...context} />); await connect();
  let finish!: () => void; deferred = new Promise<void>(resolve => { finish = resolve; });
  fireEvent.change(screen.getByLabelText('Ask Agent Isle'), { target: { value: 'What next?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  view.rerender(<AgentIsle {...context} page="team" label="Project team" displayContext="Local sample: team" />);
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled());
  expect(screen.queryByText('Collect a clear view of the pipe connection.')).not.toBeInTheDocument();
});

it('clears context and history on connected-project switch', async () => {
  render(<AgentIsle {...context} />); await connect();
  fireEvent.change(screen.getByLabelText('Ask Agent Isle'), { target: { value: 'What next?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Collect a clear view of the pipe connection.');
  fireEvent.change(screen.getByLabelText('Connected project'), { target: { value: 'other' } });
  expect(screen.queryByText('Collect a clear view of the pipe connection.')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Ask Agent Isle')).toHaveValue('');
});
