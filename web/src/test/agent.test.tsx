import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as http from '../api/client';
import type { DailySummary, Run, VoiceNote } from '../api/agent.generated';
import Agent from '../workspace/Agent';

vi.mock('../components/AuthImage', () => ({ default: () => <img alt="Submitted work evidence" /> }));
vi.mock('../components/ProjectModelContext', () => ({ default: function MockProjectModel({ projectId, focusToken }: { projectId: string; focusToken: number }) {
  const model = useQuery({ queryKey: ['home-model', projectId, null], queryFn: () => http.api<string>(`/projects/${projectId}/elements`) });
  return <div data-testid="model">{model.data}<span data-testid="focus">{focusToken}</span></div>;
} }));

let role: 'pm' | 'trade';
let saved: Run[];
let modelStatus: string;
let uploadCalls: number;
let failStart: boolean;
let voiceNotes: VoiceNote[];
let briefing: DailySummary | null;
let deferredSuggestion: Promise<unknown> | null;
const run = (): Run => ({ id: 'run', project_id: 'project', upload_id: 'upload', model_version_id: 'version',
  status: 'awaiting_review', created_at: '2026-10-06T12:00:00Z', updated_at: '2026-10-06T12:00:00Z',
  policy_version: 'review-only-v1', prompt_version: 'presence-v1', model: 'test-provider-double', error: null,
  sources: [], checks: [{ id: 'check', check_code: 'visible_component_presence', check_version: '1',
    element_ids: ['sink'], outcome: 'pass', observation: 'Sink visibly present', evidence_ids: ['photo'],
    sources: [], limitations: ['Visible presence only'], completion_eligible: false }],
  actions: [{ id: 'action', kind: 'record_progress', status: 'proposed', expected_revision: 1,
    fingerprint: 'a'.repeat(64), check_ids: ['check'], element_ids: ['sink'], description: 'Review sink', requires_review: true }] });

beforeEach(() => {
  localStorage.clear(); role = 'trade'; saved = []; modelStatus = 'needs_review'; uploadCalls = 0; failStart = false;
  voiceNotes = []; briefing = null; deferredSuggestion = null;
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:audio-fixture'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  vi.spyOn(http, 'api').mockImplementation(async (path, init = {}) => {
    if (path === '/auth/login') return { access_token: 'test-token', refresh_token: 'test-refresh' };
    if (path === '/auth/me') return { id: role, name: role === 'pm' ? 'Pat Manager' : 'Sam Worker', email: 'person@example.com' };
    if (path === '/auth/logout') return undefined;
    if (path === '/projects') return [{ id: 'project', name: 'Shared project', my_role: role, my_trades: ['plumbing'], my_zone_ids: ['bath'] }];
    if (path.endsWith('/tree')) return [{ levels: [{ zones: [{ id: 'bath', name: 'Bathroom' }] }] }];
    if (path.endsWith('/issues')) return [];
    if (path.endsWith('/members')) return [{ user: { id: 'pm', name: 'Pat Manager' } }];
    if (path.endsWith('/agent/voice')) {
      if (init.method === 'POST') {
        expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy();
        expect(init.json).toMatchObject({ zone_id: 'bath', trade: 'plumbing', filename: 'update.wav', mime_type: 'audio/wav' });
        voiceNotes = [{ id: 'voice', project_id: 'project', actor_id: 'trade', zone_id: 'bath', trade: 'plumbing', filename: 'update.wav',
          mime_type: 'audio/wav', captured_at: null, created_at: '2026-10-06T12:00:00Z', status: 'completed', original_text: 'Sink fitted',
          text: 'Sink fitted', revision: 0, model: 'test-transcribe-double', original_url: '/api/agent/voice/voice/file', error: null }];
        return voiceNotes[0];
      }
      return structuredClone(voiceNotes);
    }
    if (path === '/agent/voice/voice/file') return new Blob(['fixture'], { type: 'audio/wav' });
    if (path === '/agent/voice/voice' && init.method === 'PATCH') {
      expect(init.json).toMatchObject({ text: 'Sink positioned, awaiting connection', expected_revision: 0 });
      voiceNotes = [{ ...voiceNotes[0], text: 'Sink positioned, awaiting connection', revision: 1 }]; return voiceNotes[0];
    }
    if (path.includes('/agent/summary?')) return briefing || { status: 'unavailable', reason: 'No briefing generated', statements: [] };
    if (path.endsWith('/agent/summary/refresh')) {
      briefing = { project_id: 'project', date: '2026-10-06', timezone: 'UTC', status: 'available', generated_at: '2026-10-06T12:00:00Z',
        partial_history: true, reason: 'Supported saved activity only', statements: [{ text: 'Work update received in Bathroom.', event_ids: [42], run_ids: [] }] };
      return briefing;
    }
    if (path.endsWith('/agent/suggestions')) {
      const input = init.json as { input_revision: string };
      if (deferredSuggestion) await deferredSuggestion;
      return { input_revision: input.input_revision, status: 'available', reason: null, suggestions: [{
        text: 'Sink positioned; awaiting connection', reason: 'Clarifies the reported work', element_ids: ['sink'], sources: [] }] };
    }
    if (path.includes('/checklist')) return { model_version_id: 'version', items: [{ id: 'sink', name: 'Sink', ifc_class: 'IfcSanitaryTerminal' }] };
    if (path.endsWith('/elements')) return modelStatus;
    if (path === '/uploads/upload') return { id: 'upload', zone_id: 'bath', photos: [{ id: 'photo', url: '/photos/photo/file' }],
      verifications: modelStatus === 'done' ? [{ id: 'accepted', source: 'manager', state: 'approved', confirmed_by: 'pm', reason: 'Inspected the submitted view' }] : [] };
    if (path === '/projects/project/uploads' && init.method === 'POST') {
      uploadCalls++;
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get('element_ids')).toBe('["sink"]');
      return { id: 'upload', zone_id: 'bath', photos: [] };
    }
    if (path === '/projects/project/agent/runs') {
      if (init.method === 'POST') {
        expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy();
        if (failStart) throw new Error('Provider setup unavailable');
        saved = [run()]; return saved[0];
      }
      return structuredClone(saved);
    }
    if (path === '/agent/actions/action/decision') {
      expect(init.json).toMatchObject({ fingerprint: 'a'.repeat(64), expected_revision: 1, reason: 'Inspected the submitted view' });
      saved = [{ ...saved[0], status: 'completed', actions: [{ ...saved[0].actions[0], status: 'applied' }] }];
      modelStatus = 'done'; return {};
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); window.history.replaceState({}, '', '/'); });

async function signIn() {
  render(<Agent />);
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('option', { name: 'Shared project' });
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'project' } });
  await screen.findByRole('heading', { name: 'Saved assessments' });
}

it('opens a scoped mobile capture link and sends scan screenshots through the existing authorized photo workflow', async () => {
  window.history.replaceState({}, '', '/field-capture?project=project');
  render(<Agent captureOnly />);
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('heading', { name: 'Saved assessments' });
  expect(screen.getByLabelText('Project')).toHaveValue('project');
  expect(screen.queryByTestId('model')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Take site photo')).toHaveAttribute('capture', 'environment');
  await screen.findByRole('option', { name: 'Bathroom' });
  fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'bath' } });
  fireEvent.click(await screen.findByLabelText('Sink'));
  fireEvent.change(screen.getByLabelText('Photos or scan screenshots'), { target: { files: [new File(['fixture screenshot'], 'scan-view.jpg', { type: 'image/jpeg' })] } });
  fireEvent.change(screen.getByLabelText('Take site photo'), { target: { files: [new File(['fixture photo'], 'site.jpg', { type: 'image/jpeg' })] } });
  expect(screen.getByText('scan-view.jpg')).toBeVisible();
  expect(screen.getByText('site.jpg')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Submit for assessment' }));
  await screen.findByText('Sink visibly present');
  expect(uploadCalls).toBe(1);
  expect(screen.queryByRole('button', { name: 'Accept work' })).not.toBeInTheDocument();
});

it('saves worker photos, retries assessment without duplicating the upload, and withholds manager decisions', async () => {
  await signIn();
  await screen.findByRole('option', { name: 'Bathroom' });
  fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'bath' } });
  fireEvent.click(await screen.findByLabelText('Sink'));
  fireEvent.change(screen.getByLabelText('Photos'), { target: { files: [new File(['test-fixture'], 'work.jpg', { type: 'image/jpeg' })] } });
  failStart = true;
  fireEvent.click(screen.getByRole('button', { name: 'Submit for assessment' }));
  await screen.findByText('Provider setup unavailable');
  expect(uploadCalls).toBe(1);
  failStart = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry assessment for saved update' }));
  await screen.findByText('Sink visibly present');
  expect(uploadCalls).toBe(1);
  expect(screen.queryByRole('button', { name: 'Accept work' })).not.toBeInTheDocument();
  expect(screen.getByText(/test-provider-double/)).toBeInTheDocument();
});

it('reviews the exact saved proposal and refreshes the model after manager acceptance', async () => {
  role = 'pm'; saved = [run()]; await signIn();
  fireEvent.click(await screen.findByRole('button', { name: /awaiting review/ }));
  const accept = await screen.findByRole('button', { name: 'Accept work' });
  expect(accept).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Review reason'), { target: { value: 'Inspected the submitted view' } });
  fireEvent.click(accept);
  await screen.findByRole('heading', { name: 'Assessment · completed' });
  await waitFor(() => expect(screen.getByTestId('model')).toHaveTextContent('done'));
  await screen.findByText('Human acceptance · Pat Manager · Inspected the submitted view');
  expect(screen.queryByRole('button', { name: 'Accept work' })).not.toBeInTheDocument();
});

it('polls shared decisions and refreshes the worker model when the PM finishes elsewhere', async () => {
  saved = [run()]; await signIn();
  await waitFor(() => expect(screen.getByTestId('model')).toHaveTextContent('needs_review'));
  saved = [{ ...saved[0], status: 'completed', actions: [{ ...saved[0].actions[0], status: 'applied' }] }]; modelStatus = 'done';
  await waitFor(() => expect(screen.getByTestId('model')).toHaveTextContent('done'), { timeout: 5000 });
  fireEvent.click(screen.getByRole('button', { name: /completed/ }));
  const first = screen.getByTestId('focus').textContent;
  fireEvent.click(await screen.findByRole('button', { name: /Locate in model/ }));
  expect(screen.getByTestId('focus').textContent).not.toBe(first);
});

it('clears the shared project view on sign out', async () => {
  saved = [run()]; await signIn();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('button', { name: 'Sign in' });
  expect(screen.queryByRole('heading', { name: 'Saved assessments' })).not.toBeInTheDocument();
  expect(http.tokenStore.get()).toBeNull();
});

it('uploads recorded voice, preserves the original after correction, and explicitly copies text into the update', async () => {
  await signIn();
  fireEvent.change(await screen.findByLabelText('Location'), { target: { value: 'bath' } });
  fireEvent.change(screen.getByLabelText('Recorded voice'), { target: { files: [new File(['explicit fixture'], 'update.wav', { type: 'audio/wav' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Transcribe recording' }));
  const transcript = await screen.findByLabelText('Transcript');
  expect(transcript).toHaveValue('Sink fitted');
  expect(screen.getByLabelText('Daily update')).toHaveValue('');
  fireEvent.change(transcript, { target: { value: 'Sink positioned, awaiting connection' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save transcript correction' }));
  await waitFor(() => expect(voiceNotes[0].revision).toBe(1));
  await waitFor(() => expect(screen.getByLabelText('Transcript')).toHaveValue('Sink positioned, awaiting connection'));
  expect(voiceNotes[0].original_text).toBe('Sink fitted');
  fireEvent.click(screen.getByRole('button', { name: 'Use transcript in update' }));
  expect(screen.getByLabelText('Daily update')).toHaveValue('Sink positioned, awaiting connection');
  expect(screen.getByLabelText('Original voice recording')).toBeInTheDocument();
});

it('offers editable suggestions and applies them only on explicit acceptance', async () => {
  await signIn();
  await screen.findByRole('option', { name: 'Bathroom' });
  fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'bath' } });
  await screen.findByLabelText('Sink');
  fireEvent.change(screen.getByLabelText('Daily update'), { target: { value: 'Sink positioned' } });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest update' }));
  await screen.findByText('Sink positioned; awaiting connection');
  expect(screen.getByLabelText('Daily update')).toHaveValue('Sink positioned');
  fireEvent.click(screen.getByRole('button', { name: 'Use suggestion' }));
  expect(screen.getByLabelText('Daily update')).toHaveValue('Sink positioned; awaiting connection');
});

it('discards a suggestion returned after the draft changes', async () => {
  await signIn();
  await screen.findByRole('option', { name: 'Bathroom' });
  fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'bath' } });
  await screen.findByLabelText('Sink');
  let finish!: () => void;
  deferredSuggestion = new Promise<void>(resolve => { finish = resolve; });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest update' }));
  fireEvent.change(screen.getByLabelText('Daily update'), { target: { value: 'Different work update' } });
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Suggest update' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Use suggestion' })).not.toBeInTheDocument();
});

it('generates a briefing only on refresh and displays saved event citations', async () => {
  await signIn();
  expect(http.api).not.toHaveBeenCalledWith('/projects/project/agent/summary/refresh', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'Refresh AI briefing' }));
  await screen.findByText('Work update received in Bathroom.');
  expect(screen.getByText('Source events: #42')).toBeInTheDocument();
  expect(screen.getByText('Supported saved activity only')).toBeInTheDocument();
});
