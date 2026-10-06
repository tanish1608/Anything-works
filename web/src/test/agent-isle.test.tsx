import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as http from '../api/client';
import AgentIsle from '../workspace/AgentIsle';

let deferred: Promise<void> | null;
beforeEach(() => {
  localStorage.clear(); deferred = null;
  vi.spyOn(http, 'api').mockImplementation(async (path, init = {}) => {
    if (path === '/agent/public-chat') {
      const body = init.json as { input_revision: string; display_context: string };
      expect(body.display_context).toContain('Local sample');
      if (deferred) await deferred;
      return { input_revision: body.input_revision, status: 'available', message: 'Collect a clear view of the pipe connection.',
        sources: [], suggested_questions: ['Which photo should I take?'], partial_context: true };
    }
    if (path === '/auth/login') return { access_token: 'test', refresh_token: 'refresh' };
    if (path === '/auth/me') return { id: 'worker', name: 'Worker', email: 'worker@example.com' };
    if (path === '/auth/logout') return undefined;
    if (path === '/projects') return [{ id: 'shared', name: 'Connected project' }, { id: 'other', name: 'Other project' }];
    if (path.endsWith('/agent/chat')) {
      const body = init.json as { input_revision: string; display_context: string };
      expect(body.display_context).toContain('Local sample');
      return { input_revision: body.input_revision, status: 'available', message: 'Connected record answer.',
        sources: [{ kind: 'model', locator: 'component:sink', id: 'version', revision: 'version', sha256: 'a'.repeat(64) }],
        suggested_questions: [], partial_context: true };
    }
    throw new Error(`Unexpected request ${path}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

const context = { page: 'record' as const, label: 'Work record', displayContext: 'Local sample: sink awaiting review' };

async function open() {
  fireEvent.click(screen.getByRole('button', { name: /Agent Isle/ }));
  await screen.findByLabelText('Ask Agent Isle');
}

async function connect() {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Connect project records' }));
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'worker@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByRole('option', { name: 'Connected project' });
  await screen.findByLabelText('Ask Agent Isle');
}

it('opens as a floating local-context assistant without login', async () => {
  render(<AgentIsle {...context} />);
  expect(http.api).not.toHaveBeenCalled();
  await open();
  expect(screen.getByText(/using this screen/)).toBeVisible();
  expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Ask Agent Isle'), { target: { value: 'How should I check this?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Collect a clear view of the pipe connection.');
  expect(http.api).toHaveBeenCalledWith('/agent/public-chat', expect.objectContaining({ method: 'POST' }));
  fireEvent.click(screen.getByRole('button', { name: 'Which photo should I take?' }));
  expect(screen.getByLabelText('Ask Agent Isle')).toHaveValue('Which photo should I take?');
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByText('Collect a clear view of the pipe connection.')).not.toBeInTheDocument();
});

it('can optionally connect to scoped project records', async () => {
  render(<AgentIsle {...context} />); await connect();
  expect(screen.getByText('Connected records')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Ask Agent Isle'), { target: { value: 'What is recorded?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Connected record answer.');
  expect(http.api).toHaveBeenCalledWith('/projects/shared/agent/chat', expect.objectContaining({ method: 'POST' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText(/using this screen/);
  expect(http.tokenStore.get()).toBeNull();
});

it('discards a late local answer when the surrounding page changes', async () => {
  const view = render(<AgentIsle {...context} />); await open();
  let finish!: () => void; deferred = new Promise<void>(resolve => { finish = resolve; });
  fireEvent.change(screen.getByLabelText('Ask Agent Isle'), { target: { value: 'What next?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  view.rerender(<AgentIsle {...context} page="team" label="Project team" displayContext="Local sample: team" />);
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled());
  expect(screen.queryByText('Collect a clear view of the pipe connection.')).not.toBeInTheDocument();
});
