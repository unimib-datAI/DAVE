// Ported from backend/documents/src/utils/http-error/index.js, plus the
// generic-error fallback from loaders/express.js's error-handling
// middleware. Used by the Next.js API routes under pages/api/auth/* to
// reproduce the exact old backend's `{ error: { message, httpStatus, error } }`
// response shape and status-code mapping (including: a plain `Error` that
// isn't an `HTTPError` always becomes a generic 500, regardless of what its
// message says - the old Express error handler never inspected message text).

export const HTTP_ERROR_CODES = {
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  CLIENT_CLOSED_REQUEST: 499,
} as const;

export class HTTPError extends Error {
  code: number;
  cause?: any;
  constructor(opts: { code: number; message?: string; cause?: any }) {
    super(opts.message ?? String(opts.cause ?? 'Unknown error'));
    this.code = opts.code;
    this.cause = opts.cause;
    this.name = 'HTTPError';
  }
}

function transformHTTPError(error: HTTPError) {
  return {
    error: {
      message: error.message,
      httpStatus: error.code,
      error: error.cause,
    },
  };
}

/** Sends a response matching the old Express app's global error handler exactly. */
export function sendHTTPErrorResponse(res: any, error: any) {
  if (!(error instanceof HTTPError)) {
    const err = new HTTPError({
      code: HTTP_ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong when processing the request.',
    });
    return res.status(err.code).json(transformHTTPError(err));
  }
  return res.status(error.code).json(transformHTTPError(error));
}
