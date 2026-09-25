// Ported from backend/documents/src/models/chatRating.js
import mongoose, { Schema, Document, Model } from 'mongoose';
// @ts-ignore - no type definitions published for this package
import Inc from 'mongoose-sequence';
// @ts-ignore - no type definitions published for this package
import paginate from 'mongoose-paginate-v2';

export interface IChatRating extends Document {
  rating?: number;
  chatState?: Record<string, any>;
  rat_id?: number;
}

export type ChatRatingModelType = Model<IChatRating> & {
  paginate: (query?: any, options?: any) => Promise<any>;
};

// Guard schema creation + plugin registration behind the "already
// registered" check - see Document.ts for why (mongoose-sequence's global
// counter registry throws if schema.plugin(AutoIncrement, ...) runs twice).
export const ChatRatingModel: ChatRatingModelType =
  (mongoose.models.ChatRating as ChatRatingModelType) ||
  (() => {
    const schema = new Schema<IChatRating>({
      rating: Number,
      chatState: Object,
    });

    // add field for auto increment id
    const AutoIncrement = Inc(mongoose);
    schema.plugin(AutoIncrement, { inc_field: 'rat_id' });
    // add pagination for this schema
    schema.plugin(paginate);

    return mongoose.model<IChatRating, ChatRatingModelType>(
      'ChatRating',
      schema,
      'chatRating'
    ) as ChatRatingModelType;
  })();

export const chatRatingDTO = (body: { rating?: number; chatstate?: Record<string, any> }) => {
  const rating = body.rating;
  const chatState = body.chatstate;
  return new ChatRatingModel({ rating, chatState });
};
