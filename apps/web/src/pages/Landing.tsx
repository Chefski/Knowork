import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ROOM_CODE_LENGTH } from '@apb/shared';
import { createRoom, getRoom } from '../api.js';

const LAST_ROOM_KEY = 'apb:last-room-code';

export function Landing() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const last = localStorage.getItem(LAST_ROOM_KEY);
    if (last) setCode(last);
  }, []);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const { code: newCode } = await createRoom();
      localStorage.setItem(LAST_ROOM_KEY, newCode);
      setLocation(`/r/${newCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
      setBusy(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code) return;
    setBusy(true);
    setError(null);
    const upper = code.trim().toUpperCase();
    try {
      await getRoom(upper);
      localStorage.setItem(LAST_ROOM_KEY, upper);
      setLocation(`/r/${upper}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'failed';
      setError(msg === 'room_not_found' ? 'No room with that code.' : msg);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="font-mono text-2xl font-semibold tracking-tight">Knowork</h1>
      <p className="mt-2 text-sm text-ink-600">
        Slack status, but for AI coding agents. See what your team's agents are doing in real time.
      </p>

      <button
        type="button"
        onClick={handleCreate}
        disabled={busy}
        className="mt-8 rounded-lg bg-ink-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
      >
        Create new room
      </button>

      <div className="my-8 flex items-center gap-3 text-xs uppercase tracking-wider text-ink-400">
        <span className="h-px flex-1 bg-ink-200" />
        or
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      <form onSubmit={handleJoin} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ROOM CODE"
          maxLength={ROOM_CODE_LENGTH}
          className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-3 font-mono text-base uppercase tracking-[0.3em] focus:border-ink-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || code.length !== ROOM_CODE_LENGTH}
          className="rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium hover:bg-ink-100 disabled:opacity-60"
        >
          Join
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-12 text-xs text-ink-400">
        Self-host this in one Docker container. See README for setup.
      </p>
    </div>
  );
}
