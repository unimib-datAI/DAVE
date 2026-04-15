/**
 * permissionInterceptor.ts
 *
 * Patches window.fetch to intercept tRPC calls that fail with a permission
 * error (401 / 403) and surface them to the user via a caller-supplied
 * callback.  Has NO antd dependency so it is safe to import on the server
 * and can be wired to any notification system.
 *
 * Typical wiring in _app.tsx:
 *
 *   // 1. Install the fetch patch once on mount
 *   useEffect(() => setupPermissionInterceptor(), []);
 *
 *   // 2. Inside a component that has access to App.useApp():
 *   const { message } = App.useApp();
 *   useEffect(() => {
 *     setShowMessageFn((msg) => message.error(msg));
 *   }, [message]);
 *
 * Background
 * ──────────
 * The frontend never calls the backend directly; every request goes through
 * a Next.js tRPC API route:
 *
 *   Browser  →  POST /api/trpc/<procedure>  →  tRPC resolver (Node.js)
 *                                                → fetchJson → backend (403)
 *
 * Because fetchJson runs in Node.js, setPermissionDeniedHandler never fires
 * during a tRPC call.  Instead we patch the *browser's* window.fetch so we
 * can read the tRPC JSON envelope before the tRPC client processes it.
 *
 * tRPC v9 single-operation error envelope (no transformer):
 *
 *   {
 *     id: null,
 *     error: {
 *       message: string,       // e.g. "Forbidden"
 *       code: number,          // JSON-RPC code  (-32603)
 *       data: {
 *         code: string,        // "INTERNAL_SERVER_ERROR" | "FORBIDDEN" …
 *         httpStatus: number,  // 500 | 403 | 401 …
 *         path: string,
 *       }
 *     }
 *   }
 *
 * When the backend returns 403 and the resolver re-throws with
 *   TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
 * the HTTP status is 500 but error.message equals the statusText "Forbidden".
 * We therefore check BOTH the HTTP status AND known message phrases.
 */

import { setPermissionDeniedHandler } from './fetchJson';

// ─────────────────────────────────────────────────────────────────────────────
// Callback registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level display function.  Defaults to console.warn so that permission
 * errors are always logged even if the React tree hasn't wired up a UI handler
 * yet (e.g. during the very first render before any useEffect has run).
 */
let _showMessage: (msg: string) => void = (msg) =>
  console.warn('[permissionInterceptor]', msg);

/**
 * Register the function that will be called when a permission error is
 * detected.  Call this from inside a React component that has access to the
 * antd App context:
 *
 *   const { message } = App.useApp();
 *   useEffect(() => {
 *     setShowMessageFn((msg) => message.error(msg));
 *   }, [message]);
 */
export function setShowMessageFn(fn: (msg: string) => void): void {
  _showMessage = fn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface PermissionErrorInfo {
  status: 401 | 403;
  /** Raw message from the tRPC error payload (may be a generic status text). */
  rawMessage: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspect a parsed tRPC response body and decide whether it represents a
 * permission error.  Returns structured info or null.
 *
 * Detection order:
 *  1. HTTP 403 / 401 at the tRPC level (resolver threw TRPCError FORBIDDEN /
 *     UNAUTHORIZED).
 *  2. data.code or data.httpStatus inside the tRPC envelope indicates 403/401.
 *  3. The error message string matches a well-known permission-error phrase.
 */
function extractPermissionError(
  body: unknown,
  httpStatus: number
): PermissionErrorInfo | null {
  // ── 1. tRPC itself returned a proper 403 / 401 ────────────────────────────
  if (httpStatus === 403 || httpStatus === 401) {
    const rawMessage: string =
      (body as any)?.error?.message ??
      (body as any)?.message ??
      (httpStatus === 403 ? 'Forbidden' : 'Unauthorized');
    return { status: httpStatus as 401 | 403, rawMessage };
  }

  // ── 2 & 3. tRPC returned 500 but the cause was a backend 403 / 401 ────────
  const trpcError = (body as any)?.error;
  if (!trpcError) return null;

  // tRPC stores the mapped code and original HTTP status under `data`.
  // With superjson transformer it may live under `json.data` — check both.
  const dataCode: string | undefined =
    trpcError?.data?.code ?? trpcError?.json?.data?.code;
  const dataHttpStatus: number | undefined =
    trpcError?.data?.httpStatus ?? trpcError?.json?.data?.httpStatus;

  if (dataCode === 'FORBIDDEN' || dataHttpStatus === 403) {
    return {
      status: 403,
      rawMessage: trpcError.message ?? trpcError?.json?.message ?? 'Forbidden',
    };
  }

  if (dataCode === 'UNAUTHORIZED' || dataHttpStatus === 401) {
    return {
      status: 401,
      rawMessage:
        trpcError.message ?? trpcError?.json?.message ?? 'Unauthorized',
    };
  }

  // ── 3. Message string heuristics ─────────────────────────────────────────
  const rawMsg: string = trpcError.message ?? trpcError?.json?.message ?? '';
  const lowerMsg = rawMsg.toLowerCase();

  if (
    lowerMsg === 'forbidden' ||
    lowerMsg.includes('insufficient permission') ||
    lowerMsg.includes('no permissions configured') ||
    lowerMsg.includes('permission denied')
  ) {
    return { status: 403, rawMessage: rawMsg || 'Forbidden' };
  }

  if (
    lowerMsg === 'unauthorized' ||
    lowerMsg.includes('no authentication token') ||
    lowerMsg.includes('session has expired')
  ) {
    return { status: 401, rawMessage: rawMsg || 'Unauthorized' };
  }

  return null;
}

/**
 * Build a user-friendly notification string.
 * - Generic status text  → polished sentence.
 * - Specific backend msg → prefix it so the user sees the exact reason.
 */
function buildUserMessage(info: PermissionErrorInfo): string {
  const raw = info.rawMessage.trim();
  const isGenericOrEmpty =
    raw === '' ||
    raw.toLowerCase() === 'forbidden' ||
    raw.toLowerCase() === 'unauthorized';

  if (info.status === 403) {
    return isGenericOrEmpty
      ? 'You do not have permission to perform this action.'
      : `Permission denied: ${raw}`;
  }

  return isGenericOrEmpty
    ? 'Your session has expired. Please sign in again.'
    : `Authentication required: ${raw}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Install the global permission-denied interceptor.  Call client-side only
 * (e.g. inside a useEffect in _app.tsx).  Returns a cleanup that restores
 * the original window.fetch:
 *
 *   useEffect(() => setupPermissionInterceptor(), []);
 *
 * What it does:
 *  1. Patches window.fetch.  Every request to /api/trpc is inspected; when
 *     the response body signals a 401/403 (HTTP level or inside the tRPC JSON
 *     envelope) _showMessage() is called.
 *  2. Registers a fetchJson permissionDeniedHandler for any direct client-side
 *     fetchJson calls outside of tRPC.
 */
export function setupPermissionInterceptor(): () => void {
  if (typeof window === 'undefined') return () => {};

  const original = window.fetch.bind(window);

  window.fetch = async (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> => {
    const response = await original(...args);

    if (!response.ok) {
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] instanceof Request
          ? (args[0] as Request).url
          : '';

      // Only inspect tRPC endpoint responses.  Direct fetchJson calls are
      // covered by setPermissionDeniedHandler below to avoid double-firing.
      if (url.includes('/api/trpc')) {
        try {
          const body = await response.clone().json();
          const permErr = extractPermissionError(body, response.status);
          if (permErr) {
            _showMessage(buildUserMessage(permErr));
          }
        } catch {
          // Body was not valid JSON — nothing to do.
        }
      }
    }

    return response;
  };

  // Cover direct client-side fetchJson calls (non-tRPC paths).
  setPermissionDeniedHandler((status, serverMessage) => {
    const info: PermissionErrorInfo = {
      status,
      rawMessage: serverMessage ?? '',
    };
    _showMessage(buildUserMessage(info));
  });

  return () => {
    window.fetch = original;
  };
}
