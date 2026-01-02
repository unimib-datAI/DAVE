import mongoose from "mongoose";
import { Service } from "../models/service";

/**
 * Connect to MongoDB and ensure default annotation services exist.
 *
 * For each pipeline service type we insert (upsert) a default record named
 * `DEFAULT-<TYPE>` using the environment variable configured URI or the
 * fallback used by the annotation pipeline.
 */
export const mongoLoader = async () => {
  try {
    console.log("Setup mongodb...", process.env.MONGO);
    await mongoose.connect(process.env.MONGO, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Default service URIs (match the annotation pipeline defaults / env fallbacks)
    const defaults = [
      {
        name: "DEFAULT-NER",
        uri:
          process.env.ANNOTATION_SPACYNER_URL ||
          "http://spacyner:80/api/spacyner",
        serviceType: "NER",
        description: "Default NER service",
      },
      {
        name: "DEFAULT-NEL",
        uri:
          process.env.ANNOTATION_BLINK_URL ||
          "http://biencoder:80/api/blink/biencoder/mention/doc",
        serviceType: "NEL",
        description: "Default NEL service",
      },
      {
        name: "DEFAULT-CLUSTERING",
        uri:
          process.env.ANNOTATION_NILCLUSTER_URL ||
          "http://clustering:80/api/clustering",
        serviceType: "CLUSTERING",
        description: "Default clustering service",
      },
      {
        name: "DEFAULT-CONSOLIDATION",
        uri:
          process.env.ANNOTATION_CONSOLIDATION_URL ||
          "http://consolidation:80/api/consolidation",
        serviceType: "CONSOLIDATION",
        description: "Default consolidation service",
      },
    ];

    // Upsert each default service so we don't create duplicates on restart
    for (const d of defaults) {
      try {
        await Service.updateOne(
          { name: d.name },
          {
            $setOnInsert: {
              name: d.name,
              uri: d.uri,
              serviceType: d.serviceType,
              description: d.description,
              disabled: false,
            },
          },
          { upsert: true },
        );
      } catch (err) {
        // Log and continue — loader shouldn't fail entirely because of a single upsert
        console.error(`Failed to upsert default service ${d.name}:`, err);
      }
    }

    console.log("MongoDB connected and default services ensured.");
  } catch (err) {
    console.error(err);
    throw new Error("Couldn't not connecto to DB.");
  }
};
