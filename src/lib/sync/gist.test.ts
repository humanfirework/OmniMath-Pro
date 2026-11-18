import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GIST_FILENAME,
  buildGistPayload,
  getStoredGistId,
  parseGistResponse,
  pickBackupGist,
  pullFromGist,
  pushToGist,
  setGistToken,
} from './gist';
import type { WorkspaceSnapshot } from './snapshot';

const snapshot: WorkspaceSnapshot = {
  app: 'omnimath',
  version: 1,
  createdAt: '2026-11-19T00:00:00.000Z',
  keys: { 'omnimath-pro-v2': '{"results":[]}' },
};

/** Minimal Response stub — avoids relying on the runtime's Response class. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('GitHub Gist sync helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('builds a private gist payload with the workspace snapshot', () => {
    const payload = buildGistPayload(snapshot);
    expect(payload.public).toBe(false);
    expect(Object.keys(payload.files)).toEqual([GIST_FILENAME]);
    const parsed = JSON.parse(payload.files[GIST_FILENAME].content);
    expect(parsed.app).toBe('omnimath');
    expect(parsed.keys['omnimath-pro-v2']).toBe('{"results":[]}');
  });

  it('parses a gist response back into a snapshot', () => {
    const json = {
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(snapshot) },
      },
    };
    const snap = parseGistResponse(json);
    expect(snap.createdAt).toBe(snapshot.createdAt);
    expect(snap.keys['omnimath-pro-v2']).toBe('{"results":[]}');
  });

  it('rejects gists without the backup file or with empty content', () => {
    expect(() => parseGistResponse({ files: {} })).toThrow('没有');
    expect(() =>
      parseGistResponse({ files: { [GIST_FILENAME]: { content: '  ' } } }),
    ).toThrow('为空');
    expect(() => parseGistResponse(null)).toThrow();
  });

  it('picks the newest gist that contains the backup file', () => {
    const list = [
      { id: 'old', updated_at: '2026-01-01T00:00:00Z', files: { [GIST_FILENAME]: {} } },
      { id: 'new', updated_at: '2026-05-01T00:00:00Z', files: { [GIST_FILENAME]: {} } },
      { id: 'other', updated_at: '2026-06-01T00:00:00Z', files: { 'notes.txt': {} } },
    ];
    expect(pickBackupGist(list)?.id).toBe('new');
    expect(pickBackupGist([])).toBeNull();
    expect(pickBackupGist(null)).toBeNull();
  });

  it('creates a gist on first upload, reuses it, and can pull it back', async () => {
    localStorage.setItem('omnimath-pro-v2', '{"results":[]}');
    setGistToken('ghp_test');

    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      if (url.includes('/gists?per_page')) return jsonResponse([]);
      if (url.endsWith('/gists') && method === 'POST') {
        return jsonResponse({ id: 'gist-1', updated_at: '2026-05-01T00:00:00Z' });
      }
      if (url.endsWith('/gists/gist-1') && method === 'PATCH') {
        return jsonResponse({ id: 'gist-1', updated_at: '2026-05-02T00:00:00Z' });
      }
      if (url.endsWith('/gists/gist-1') && method === 'GET') {
        return jsonResponse({
          id: 'gist-1',
          files: { [GIST_FILENAME]: { content: JSON.stringify(snapshot) } },
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await pushToGist('ghp_test');
    expect(first.gistId).toBe('gist-1');
    expect(getStoredGistId()).toBe('gist-1');
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/gists'))).toBe(true);

    const second = await pushToGist('ghp_test');
    expect(second.gistId).toBe('gist-1');
    expect(calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/gists/gist-1'))).toBe(true);

    const pulled = await pullFromGist('ghp_test');
    expect(pulled.gistId).toBe('gist-1');
    expect(pulled.snapshot.createdAt).toBe(snapshot.createdAt);
  });
});
