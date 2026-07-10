// Ported from backend/documents/src/controllers/chat.js
import { ChatRatingModel } from '../db/models/ChatRating';
import { dbConnect } from '../db/connection';

export const ChatController = {
  saveRating: async (rate: number, chatState: any) => {
    await dbConnect();
    try {
      return await ChatRatingModel.create({ rating: rate, chatState });
    } catch (error) {
      throw new Error(`Could not save rating. ${error}`);
    }
  },
};
