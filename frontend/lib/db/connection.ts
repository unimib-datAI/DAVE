// MongoDB connection for the data layer ported from backend/documents
// (see backend/documents/src/loaders/mongo.js for the original).
//
// Next.js dev mode hot-reloads modules on every save, which would otherwise
// call mongoose.connect() repeatedly and leak connections. The fix is the
// standard Next.js+Mongoose idiom: cache the connection promise on `global`
// so it survives module re-evaluation across hot reloads.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO;

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.__mongooseCache || {
  conn: null,
  promise: null,
};
global.__mongooseCache = cached;

export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!MONGO_URI) {
    throw new Error('MONGO environment variable is not set');
  }

  if (!cached.promise) {
    console.log('Setup mongodb...', MONGO_URI);
    cached.promise = mongoose
      .connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      } as any)
      .then((m) => {
        console.log('MongoDB connected.');
        return m;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default dbConnect;
