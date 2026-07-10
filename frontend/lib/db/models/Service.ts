// Ported from backend/documents/src/models/service.js
//
// Stores minimal configuration for an annotation pipeline service:
//  - name: unique identifier for the service entry (display name)
//  - uri: endpoint to call the service
//  - serviceType: free-form label used for grouping/display (no enum restriction)

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IService extends Document {
  name: string;
  uri: string;
  serviceType?: string;
  description?: string;
  disabled?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const serviceSchema = new Schema<IService>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    uri: {
      type: String,
      required: true,
      trim: true,
    },
    // Logical service type used to group/select services - free-form, any string is valid
    serviceType: {
      type: String,
      required: false,
      default: 'OTHER',
      trim: true,
      index: true,
    },
    // Optional human-readable description
    description: {
      type: String,
      required: false,
      trim: true,
    },
    // Optionally mark a service as disabled without deleting it
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const ServiceModel: Model<IService> =
  mongoose.models.Service ||
  mongoose.model<IService>('Service', serviceSchema, 'services');

/**
 * Helper factory to create a Service document from a plain object.
 * Accepts both `serviceType` and legacy `type` property in the input body.
 */
export const serviceDTO = (body: {
  name: string;
  uri: string;
  description?: string;
  disabled?: boolean;
  serviceType?: string;
  type?: string;
}) => {
  const name = body.name;
  const uri = body.uri;
  const description = body.description;
  const disabled = body.disabled || false;
  // Accept either `serviceType` or `type` from input, fallback to OTHER
  const serviceType = body.serviceType || body.type || 'OTHER';

  return new ServiceModel({
    name,
    uri,
    serviceType,
    description,
    disabled,
  });
};
