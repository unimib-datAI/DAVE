import mongoose, { Schema } from "mongoose";
import Inc from "mongoose-sequence";
import paginate from "mongoose-paginate-v2";

/**
 * Document model (updated)
 * - added `collectionId` to reference the collection this document belongs to
 */
const schema = new mongoose.Schema({
    id: {
        type: String,
        required: false,
    },
    name: String,
    preview: String,
    text: String,
    features: Object,
    offset_type: String, // "p" for python style
    collectionId: { type: String, required: false, index: true },
});

// add field for auto increment id
const AutoIncrement = Inc(mongoose);
schema.plugin(AutoIncrement, { inc_field: "inc_id" });
// add pagination for this schema
schema.plugin(paginate);
export const Document = mongoose.model("Document", schema, "documents");

export const documentDTO = (body) => {
    const text = body.text;
    const preview = body.preview || (body.text ? body.text.slice(0, 400) : "");
    const name =
        body.name ||
        (body.text ? body.text.split(" ").slice(0, 3).join(" ") : "");
    const features = body.features;
    const offset_type = body.offset_type || "p";
    const id = body.id;
    const collectionId = body.collectionId;
    return new Document({
        id,
        name,
        preview,
        text,
        features,
        offset_type,
        collectionId,
    });
};
