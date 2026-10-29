import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_FETCH_TIMEOUT_MS = 10000;

function isBrowserOffline(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem('iatf_force_offline') === 'true') return true;
  } catch {
    // ignore storage errors
  }
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

const offlineAwareFetch: typeof fetch = async (input, init) => {
  if (isBrowserOffline()) {
    throw new TypeError('Failed to fetch: System is in offline mode');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new TypeError('Failed to fetch: Network request timed out'));
  }, SUPABASE_FETCH_TIMEOUT_MS);

  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      throw new TypeError('Failed to fetch: Request aborted');
    }
    init.signal.addEventListener('abort', () => controller.abort(init.signal?.reason), { once: true });
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TypeError('Failed to fetch: Network timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookieOptions: {
        maxAge: undefined,
      },
      global: {
        fetch: offlineAwareFetch,
      },
    }
  );
}

