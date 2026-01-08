import mongoose from "mongoose";

/**
 * Configuration model
 * Stores annotation pipeline configurations for users.
 * Each configuration contains a mapping of pipeline slots to services.
 *
 * Fields:
 *  - userId: the user who owns this configuration
 *  - name: human-readable name for the configuration
 *  - isActive: whether this is the currently active configuration for the user
 *  - services: mapping of slot names to service configurations
 *    Each service entry contains: { id, name, uri, serviceType }
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
    // Services mapping: slot name -> service configuration
    // Example: { "NER": { id: "...", name: "SpaCy NER", uri: "http://...", serviceType: "NER" } }
    services: {
      type: Map,
      of: new Schema(
        {
          id: {
            type: String,
            required: false,
          },
          name: {
            type: String,
            required: true,
          },
          uri: {
            type: String,
            required: false,
          },
          serviceType: {
            type: String,
            required: false,
          },
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

/**
 * Helper factory to create a Configuration document from a plain object.
 */
export const configurationDTO = (body) => {
  const userId = body.userId;
  const name = body.name;
  const isActive = body.isActive !== undefined ? body.isActive : false;
  const services = body.services || {};

  return new Configuration({
    userId,
    name,
    isActive,
    services,
  });
};

export const Configuration = mongoose.model(
  "Configuration",
  configurationSchema,
  "configurations"
);
