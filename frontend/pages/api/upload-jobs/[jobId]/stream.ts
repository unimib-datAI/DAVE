import type { NextApiRequest, NextApiResponse } from 'next';
import { getRequestUser } from '@/lib/documentsBackend/keycloakAuth';
import { UploadJobController } from '@/lib/documentsBackend/uploadJobController';
import { isTerminalStatus, UploadJob } from '@/lib/upload/types';

export const config = {
  api: {
    responseLimit: false,
  },
};

const POLL_INTERVAL_MS = 1000;
// Cap a single connection's lifetime; EventSource reconnects automatically,
// so this just bounds how long any one server-side handle stays open.
const MAX_STREAM_MS = 10 * 60 * 1000;

/**
 * Server-Sent-Events bridge for upload job progress.
 *
 * This endpoint holds no state of its own: it just polls the durable
 * MongoDB-backed job record (via the backend REST API) and forwards diffs to
 * the browser. That decoupling is what makes it robust — it doesn't matter
 * which process actually ran the upload, and EventSource's built-in
 * auto-reconnect means a closed/reopened tab simply resumes watching the
 * same, still-accurate, server-side truth.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const jobId = req.query.jobId as string;
  const token = (req.query.token as string) || '';

  let userId: string;
  try {
    const user = await getRequestUser(token);
    userId = user.sub;
  } catch (error) {
    res.status(401).json({ message: 'No authentication token provided' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let lastPayload = '';
  let closed = false;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;

  const send = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const stop = () => {
    if (closed) return;
    closed = true;
    if (intervalId) clearInterval(intervalId);
    if (maxTimer) clearTimeout(maxTimer);
    res.end();
  };

  const poll = async () => {
    try {
      const job = (await UploadJobController.getByJobId(jobId)) as any as
        | (UploadJob & { userId?: string })
        | null;
      if (!job) {
        send('error', { message: 'Job not found' });
        stop();
        return;
      }
      if (job.userId !== userId) {
        send('error', { message: 'Access denied' });
        stop();
        return;
      }

      const payload = JSON.stringify(job);
      if (payload !== lastPayload) {
        lastPayload = payload;
        send('job', job);
      }

      if (isTerminalStatus(job.status)) {
        send('done', { status: job.status });
        stop();
      }
    } catch (error: any) {
      send('error', {
        message: error?.message || 'Failed to fetch job status',
      });
      stop();
    }
  };

  await poll();
  if (!closed) {
    intervalId = setInterval(poll, POLL_INTERVAL_MS);
    maxTimer = setTimeout(stop, MAX_STREAM_MS);
  }

  req.on('close', stop);
}
