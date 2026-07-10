// Ported from backend/documents/src/models/collection.js
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICollection extends Document {
  id: string;
  name: string;
  ownerId: string;
  config: Record<string, any>;
  allowedUserIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const CollectionSchema = new Schema<ICollection>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
    },
    config: {
      type: Object,
      default: { typesToHide: [] },
    },
    allowedUserIds: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const CollectionModel: Model<ICollection> =
  mongoose.models.Collection ||
  mongoose.model<ICollection>('Collection', CollectionSchema, 'collections');
