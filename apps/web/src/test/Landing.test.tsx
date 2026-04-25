/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { Landing } from '../pages/Landing.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  localStorage.clear();
});

function renderWithRouter() {
  const { hook, navigate } = memoryLocation({ path: '/' });
  const result = render(
    <Router hook={hook}>
      <Landing />
    </Router>,
  );
  return { ...result, navigate, hook };
}

describe('Landing', () => {
  it('renders the create button and join form', () => {
    renderWithRouter();
    expect(screen.getByText(/Create new room/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ROOM C/i)).toBeInTheDocument();
  });

  it('creates a room and stores the code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 'ABC234' }),
    });

    renderWithRouter();
    fireEvent.click(screen.getByText(/Create new room/i));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/rooms', { method: 'POST' }));
    expect(localStorage.getItem('apb:last-room-code')).toBe('ABC234');
  });

  it('autofills the last-used room code', () => {
    localStorage.setItem('apb:last-room-code', 'ZXY789');
    renderWithRouter();
    const input = screen.getByPlaceholderText(/ROOM C/i) as HTMLInputElement;
    expect(input.value).toBe('ZXY789');
  });
});
