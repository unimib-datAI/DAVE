// Ported from backend/documents/src/models/configuration.js
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IConfigurationStep {
  id?: string;
  name: string;
  uri: string;
  serviceType?: string;
}

export interface IConfiguration extends Document {
  userId: string;
  name: string;
  isActive: boolean;
  steps: IConfigurationStep[];
  services?: Map<string, IConfigurationStep>;
  createdAt?: Date;
  updatedAt?: Date;
}

const configurationSchema = new Schema<IConfiguration>(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Ordered pipeline steps - called sequentially in the annotation pipeline.
    // Each step: { id?, name, uri, serviceType? }
    steps: {
      type: [
        new Schema<IConfigurationStep>(
          {
            // Optional reference to a Service document _id
            id: { type: String, required: false },
            name: { type: String, required: true },
            uri: { type: String, required: true },
            serviceType: { type: String, required: false, default: 'OTHER' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // Legacy field kept for backward compat - superseded by steps
    services: {
      type: Map,
      of: new Schema(
        {
          id: { type: String, required: false },
          name: { type: String, required: true },
          uri: { type: String, required: false },
          serviceType: { type: String, required: false },
        },
        { _id: false }
      ),
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure unique configuration names per user
configurationSchema.index({ userId: 1, name: 1 }, { unique: true });

export const ConfigurationModel: Model<IConfiguration> =
  mongoose.models.Configuration ||
  mongoose.model<IConfiguration>('Configuration', configurationSchema, 'configurations');

/**
 * Helper factory to create a Configuration document from a plain object.
 */
export const configurationDTO = (body: {
  userId: string;
  name: string;
  isActive?: boolean;
  steps?: IConfigurationStep[];
  services?: Record<string, IConfigurationStep>;
}) => {
  const userId = body.userId;
  const name = body.name;
  const isActive = body.isActive !== undefined ? body.isActive : false;
  // Prefer steps array; fall back to empty array
  const steps = Array.isArray(body.steps) ? body.steps : [];
  // Keep legacy services for migration purposes
  const services = body.services || {};

  return new ConfigurationModel({
    userId,
    name,
    isActive,
    steps,
    services,
  } as any);
};
