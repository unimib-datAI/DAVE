import mongoose, { Schema } from "mongoose";
import Inc from "mongoose-sequence";
import paginate from "mongoose-paginate-v2";

const schema = new mongoose.Schema({
  rating: Number,
  chatState: Object,
});

// add field for auto increment id
const AutoIncrement = Inc(mongoose);
schema.plugin(AutoIncrement, { inc_field: "rat_id" });
// add pagination for this schema
schema.plugin(paginate);
export const ChatRating = mongoose.model("ChatRating", schema, "chatRating");

export const chatRatingDTO = (body) => {
  const rating = body.rating;
  const chatState = body.chatstate;
  return new ChatRating({ rating, chatState });
};
