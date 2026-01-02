import mongoose from "mongoose";

/**
 * Service model
 * Stores minimal configuration for an annotation pipeline service:
 *  - name: unique identifier for the service entry (display name)
 *  - uri: endpoint to call the service
 *  - serviceType: logical grouping/type used in selects (e.g. "NER", "NEL", "CLUSTERING", "CONSOLIDATION", etc.)
 *
 * The schema uses timestamps so createdAt/updatedAt are automatically kept.
 */

const { Schema } = mongoose;

/**
 * Allowed service types. Extend as needed by the application.
 */
const ALLOWED_SERVICE_TYPES = [
  "NER",
  "NEL",
  "CLUSTERING",
  "CONSOLIDATION",
  "NORMALIZATION",
  "OTHER",
];

const serviceSchema = new Schema(
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
    // Logical service type used to group/select services (e.g. NER, NEL)
    serviceType: {
      type: String,
      enum: ALLOWED_SERVICE_TYPES,
      required: true,
      default: "OTHER",
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
  },
);

// Ensure a case-insensitive unique index on name if the database supports collation.
// MongoDB unique index is case-sensitive by default; applications may want case-insensitive.
// The following is a best-effort: creating a second index with lowercased name is another option.
// For now we keep the simple unique index declared above.
//
// serviceSchema.index({ name: 1 }, { unique: true });

/**
 * Helper factory to create a Service document from a plain object.
 * Accepts both `serviceType` and legacy `type` property in the input body.
 */
export const serviceDTO = (body) => {
  const name = body.name;
  const uri = body.uri;
  const description = body.description;
  const disabled = body.disabled || false;
  // Accept either `serviceType` or `type` from input, fallback to OTHER
  const serviceType = body.serviceType || body.type || "OTHER";

  // Normalize serviceType to a known value if possible
  const normalizedType = ALLOWED_SERVICE_TYPES.includes(serviceType)
    ? serviceType
    : "OTHER";

  return new Service({
    name,
    uri,
    serviceType: normalizedType,
    description,
    disabled,
  });
};

export const Service = mongoose.model("Service", serviceSchema, "services");
