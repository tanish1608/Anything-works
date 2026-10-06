import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ModelDataset } from '../viewer/modelData';
import Workspace from '../workspace/Workspace';

const model = JSON.parse(readFileSync('public/bim-duplex/model.json', 'utf8')) as ModelDataset;
vi.mock('../viewer/modelData', async original => ({
  ...await original<typeof import('../viewer/modelData')>(), loadDemoModel: async () => model,
}));
vi.mock('../workspace/BuildingCanvas', () => ({ default: () => <div data-testid="shared-building" /> }));
vi.mock('../workspace/photoInput', () => ({ readPhoto: async (file: File) => ({
  id: file.name, name: file.name, sample: false, url: 'data:image/jpeg;base64,preview',
}) }));
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

it('adds copilot photos to the selected work and preserves an existing update draft', async () => {
  render(<MemoryRouter initialEntries={['/?panel=record&work=ISS-031']}><Workspace /></MemoryRouter>);
  await screen.findByRole('complementary', { name: 'Work record' });
  const attach = async (name: string, note?: string) => {
    const copilot = within(screen.getByRole('region', { name: 'Project Copilot' }));
    fireEvent.click(copilot.getByRole('button', { name: 'Open Project Copilot' }));
    fireEvent.change(copilot.getByLabelText('Attach work photos'), { target: { files: [new File(['photo'], name, { type: 'image/jpeg' })] } });
    await copilot.findByRole('img', { name });
    if (note) fireEvent.change(copilot.getByLabelText('Message Placeholder AI'), { target: { value: note } });
    fireEvent.click(copilot.getByRole('button', { name: 'Add to daily update' }));
    await screen.findByRole('complementary', { name: 'Daily update' });
  };
  await attach('work.jpg', 'Installed the connection');
  let update = within(screen.getByRole('complementary', { name: 'Daily update' }));
  expect(update.getByLabelText('Work item')).toHaveValue('ISS-031');
  expect(update.getByLabelText('What changed?')).toHaveValue('Installed the connection');
  expect(update.getByRole('img', { name: 'work.jpg' })).toBeVisible();
  await attach('detail.jpg');
  update = within(screen.getByRole('complementary', { name: 'Daily update' }));
  expect(update.getByRole('img', { name: 'work.jpg' })).toBeVisible();
  expect(update.getByRole('img', { name: 'detail.jpg' })).toBeVisible();
  expect(update.getByLabelText('What changed?')).toHaveValue('Installed the connection');
  await waitFor(() => {
    const records = Object.keys(localStorage).map(key => JSON.parse(localStorage.getItem(key)!));
    const saved = records.find(record => record.draft?.item === 'ISS-031');
    expect(saved.draft.photos.map((photo: { name: string }) => photo.name)).toEqual(['work.jpg', 'detail.jpg']);
  });
  expect(screen.getAllByTestId('shared-building')).toHaveLength(1);
});
