import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
// @ts-ignore - no type definitions published for this package
import archiver from 'archiver';
import { authOptions } from '../../auth/[...nextauth]';
import { getRequestUser } from '@/lib/documentsBackend/keycloakAuth';
import { requirePermission, PermissionDeniedError } from '@/lib/documentsBackend/permission';
import { CollectionController } from '@/lib/documentsBackend/collectionController';

export const config = {
  api: {
    // Disable Next's default response size/timeout assumptions for
    // streaming - the zip is written directly to `res` below.
    externalResolver: true,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  if (!id) return res.status(400).end('Missing id');
  const collectionId = String(id);

  try {
    let token: string | undefined;
    if (process.env.NEXT_PUBLIC_USE_AUTH !== 'false') {
      const session = (await getServerSession(req, res, authOptions)) as any;
      token = session?.accessToken;
      if (!token) {
        res.status(401).end('Unauthorized');
        return;
      }
    }

    const user = await getRequestUser(token);
    await requirePermission(user, 'collections', 'view');

    const hasAccess = await CollectionController.hasAccess(collectionId, user.sub);
    if (!hasAccess) {
      res.status(403).end('Access denied');
      return;
    }

    const collection: any = await CollectionController.findById(collectionId);
    if (!collection) {
      res.status(404).end('Collection not found');
      return;
    }

    const fullDocuments = CollectionController.streamAllDocumentsConcurrent(collectionId);
    const zipFileName = `${String(collection.name).replace(/[^a-zA-Z0-9]/g, '_')}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${zipFileName}"`
    );

    const zipArchive = archiver('zip', { zlib: { level: 9 } });
    zipArchive.on('error', (err: Error) => {
      throw err;
    });
    zipArchive.pipe(res);

    for await (const doc of fullDocuments) {
      const filename = `${doc.name || doc.id}.json`;
      zipArchive.append(JSON.stringify(doc, null, 2), { name: filename });
    }
    await zipArchive.finalize();
  } catch (error: any) {
    if (error instanceof PermissionDeniedError) {
      res.status(403).end(error.message);
      return;
    }
    console.error('Error streaming collection download:', error);
    if (!res.headersSent) {
      res.status(500).end('Failed to download collection');
    } else {
      res.destroy(error);
    }
  }
}
