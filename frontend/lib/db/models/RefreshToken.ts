// Ported from backend/documents/src/models/refreshToken.js
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRefreshToken extends Document {
  token: string;
  userId: any;
  expiresAt: Date;
  revoked?: boolean;
  createdAt?: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>({
  token: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
  revoked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now() },
});

export const RefreshTokenModel: Model<IRefreshToken> =
  mongoose.models.RefreshToken ||
  mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
