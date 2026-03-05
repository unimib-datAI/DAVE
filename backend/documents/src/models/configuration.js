import mongoose from "mongoose";

/**
 * Configuration model
 * Stores annotation pipeline configurations for users.
 * Each configuration contains an ordered array of pipeline steps.
 *
 * Fields:
 *  - userId: the user who owns this configuration
 *  - name: human-readable name for the configuration
 *  - isActive: whether this is the currently active configuration for the user
 *  - steps: ordered array of pipeline steps, each called sequentially.
 *    Each step contains: { id?, name, uri, serviceType? }
 *    The pipeline engine calls step[0].uri first, passes the output to step[1].uri, etc.
 *  - services: legacy Map field kept for backward compatibility (ignored if steps is present)
 */

const { Schema } = mongoose;

const configurationSchema = new Schema(
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
        new Schema(
          {
            // Optional reference to a Service document _id
            id: { type: String, required: false },
            name: { type: String, required: true },
            uri: { type: String, required: true },
            serviceType: { type: String, required: false, default: "OTHER" },
          },
          { _id: false },
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
        { _id: false },
      ),
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// Compound index to ensure unique configuration names per user
configurationSchema.index({ userId: 1, name: 1 }, { unique: true });

/**
 * Helper factory to create a Configuration document from a plain object.
 */
export const configurationDTO = (body) => {
  const userId = body.userId;
  const name = body.name;
  const isActive = body.isActive !== undefined ? body.isActive : false;
  // Prefer steps array; fall back to empty array
  const steps = Array.isArray(body.steps) ? body.steps : [];
  // Keep legacy services for migration purposes
  const services = body.services || {};

  return new Configuration({
    userId,
    name,
    isActive,
    steps,
    services,
  });
};

export const Configuration = mongoose.model(
  "Configuration",
  configurationSchema,
  "configurations",
);
