import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  if (!id) return res.status(400).end('Missing id');

  // Resolve Authorization header: read from server-side session (no token in URL)
  const headers: Record<string, string> = {};
  if (process.env.NEXT_PUBLIC_USE_AUTH !== 'false') {
    const session = (await getServerSession(req, res, authOptions)) as any;
    const accessToken = session?.accessToken;
    if (!accessToken) {
      res.status(401).end('Unauthorized');
      return;
    }
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const backendBase = (process.env.API_BASE_URI || '').replace(/\/$/, '');
  const backendUrl = `${backendBase}/collection/${encodeURIComponent(
    String(id)
  )}/download`;

  const backendRes = await fetch(backendUrl, { headers });
  if (!backendRes.ok) {
    const text = await backendRes.text().catch(() => '');
    res.status(backendRes.status).send(text);
    return;
  }

  // Forward response headers (omit hop-by-hop headers)
  backendRes.headers.forEach((value, name) => {
    if (
      [
        'transfer-encoding',
        'connection',
        'keep-alive',
        'content-length',
      ].includes(name.toLowerCase())
    )
      return;
    res.setHeader(name, value);
  });
  // Ensure browser triggers Save dialog
  if (!backendRes.headers.get('content-disposition')) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${String(id)}.zip"`
    );
  }

  res.status(200);

  // Stream the backend response body directly to the client without buffering
  const reader = (backendRes.body as ReadableStream<Uint8Array>).getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    try {
      res.destroy(err as Error);
    } catch (_) {}
  } finally {
    try {
      reader.releaseLock();
    } catch (_) {}
  }
}
