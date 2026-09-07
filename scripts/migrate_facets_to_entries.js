import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust import paths depending on execution cwd
import { FacetsCache } from "../backend/documents/src/models/facetsCache.js";
import { FacetEntry } from "../backend/documents/src/models/facetEntry.js";

async function migrate() {
  const mongo =
    process.env.MONGODB_URI || process.env.MONGO || process.env.MONGO_URL;
  if (!mongo) {
    console.error(
      "Please set MONGO/MONGODB_URI in environment to run migration",
    );
    process.exit(1);
  }
  await mongoose.connect(mongo, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const caches = await FacetsCache.find({});
  for (const c of caches) {
    const collectionId = c.collectionId;
    for (const [facetType, arr] of Object.entries(c.facets || {})) {
      const ops = [];
      for (const f of arr || []) {
        const display = f.display_name || f.displayName || "";
        const displayNameLower = String(display).toLowerCase();
        const idsER = f.ids_ER
          ? Array.isArray(f.ids_ER)
            ? f.ids_ER
            : [f.ids_ER]
          : f.id_ER
            ? [f.id_ER]
            : [];
        const docIds = f.doc_ids
          ? Array.isArray(f.doc_ids)
            ? f.doc_ids
            : [f.doc_ids]
          : f.doc_id
            ? [f.doc_id]
            : [];
        ops.push({
          updateOne: {
            filter: { collectionId, facetType, displayNameLower },
            update: {
              $setOnInsert: {
                collectionId,
                facetType,
                displayNameLower,
                display_name: display,
                is_linked: !!f.is_linked,
              },
              $addToSet: {
                ids_ER: { $each: idsER },
                doc_ids: { $each: docIds },
              },
            },
            upsert: true,
          },
        });
      }
      if (ops.length) {
        await FacetEntry.bulkWrite(ops, { ordered: false });
      }
    }
  }
  console.log("Migration finished");
  process.exit(0);
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
