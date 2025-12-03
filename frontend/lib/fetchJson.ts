export type FetchRequestInit<BODY = any> = Omit<RequestInit, 'body'> & {
  body?: BODY;
};

export default async function fetchJson<BODY = any, JSON = unknown>(
  input: RequestInfo,
  init?: FetchRequestInit<BODY>
): Promise<JSON> {
  // Prepare headers and body carefully:
  // - If the caller provided a plain string or a FormData/URLSearchParams/Blob, pass it through as-is.
  // - Otherwise, JSON.stringify the body and ensure Content-Type: application/json is set.
  const providedHeaders = init?.headers;
  // Normalize headers to a plain object where possible. Keep provided headers precedence.
  const headers: Record<string, string> = {
    ...(providedHeaders &&
    typeof providedHeaders === 'object' &&
    !(providedHeaders instanceof Headers)
      ? (providedHeaders as Record<string, string>)
      : {}),
  };

  let bodyToSend: any = undefined;

  if (init && 'body' in init && init.body !== undefined) {
    const b = init.body as any;

    // If body is already a string (caller serialized it) or is a FormData/URLSearchParams/Blob, send it directly.
    // FormData should NOT have Content-Type set (browser will set the boundary).
    if (
      typeof b === 'string' ||
      (typeof FormData !== 'undefined' && b instanceof FormData) ||
      (typeof URLSearchParams !== 'undefined' &&
        b instanceof URLSearchParams) ||
      (typeof Blob !== 'undefined' && b instanceof Blob)
    ) {
      bodyToSend = b;
      // If it's a string but Content-Type wasn't provided, assume JSON string only when caller intended it.
      // Do not override Content-Type for FormData/Blob/URLSearchParams.
    } else {
      // For plain objects, stringify and set JSON content type if not already set.
      bodyToSend = JSON.stringify(b);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  // Inject X-Collection-Id header for document-related requests if an active collection is stored in localStorage.
  // We try/catch to avoid breaking execution in environments where localStorage is not available (SSR).
  try {
    if (typeof window !== 'undefined') {
      const collectionId = localStorage.getItem('activeCollectionId');
      // Determine the request URL string for checking whether this is a document-related call.
      const urlStr =
        typeof input === 'string'
          ? input
          : input && typeof (input as any).url === 'string'
          ? (input as any).url
          : '';
      if (
        collectionId &&
        urlStr &&
        (urlStr.includes('/document') || urlStr.includes('/save'))
      ) {
        // Do not overwrite an explicitly provided header
        if (!headers['X-Collection-Id'] && !headers['x-collection-id']) {
          headers['X-Collection-Id'] = collectionId;
        }
      }
    }
  } catch (e) {
    // ignore localStorage access errors
  }

  const composeInit: RequestInit = {
    ...init,
    headers: {
      ...headers,
    },
    ...(bodyToSend !== undefined ? { body: bodyToSend } : {}),
  };

  const response = await fetch(input, composeInit);

  // if the server replies, there's always some data in json
  // if there's a network error, it will throw at the previous line
  const data = await response.json();

  // response.ok is true when res.status is 2xx
  // https://developer.mozilla.org/en-US/docs/Web/API/Response/ok
  if (response.ok) {
    return data;
  }

  throw new FetchError({
    message: response.statusText,
    response,
    data,
  });
}

export class FetchError extends Error {
  response: Response;
  data: {
    message: string;
  };
  constructor({
    message,
    response,
    data,
  }: {
    message: string;
    response: Response;
    data: {
      message: string;
    };
  }) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(message);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FetchError);
    }

    this.name = 'FetchError';
    this.response = response;
    this.data = data ?? { message: message };
  }
}
