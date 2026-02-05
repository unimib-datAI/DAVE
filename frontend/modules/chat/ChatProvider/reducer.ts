import { createImmerReducer } from '@/utils/immerReducer';
import { State, Action } from './types';

export const chatReducer = createImmerReducer<State, Action>({
  setMessages: (state, payload) => {
    state.messages = payload.messages;
    // Ensure contexts and statuses arrays match the length of messages
    while (state.contexts.length < payload.messages.length) {
      state.contexts.push(undefined);
    }
    while (state.statuses.length < payload.messages.length) {
      state.statuses.push(undefined);
    }
  },
  addMessage: (state, payload) => {
    state.messages.push(payload.message);
    state.contexts.push(undefined);
    state.statuses.push(undefined);
  },
  updateMessage: (state, payload) => {
    const { index, message } = payload;
    if (index >= 0 && index < state.messages.length) {
      state.messages[index] = message;
    }
  },
  clearMessages: (state) => {
    state.messages = [];
    state.contexts = [];
    state.statuses = [];
  },
  setContext: (state, payload) => {
    const { index, context } = payload;
    if (index >= 0 && index < state.contexts.length) {
      state.contexts[index] = context;
    } else {
      // Extend array if needed
      while (state.contexts.length <= index) {
        state.contexts.push(undefined);
      }
      state.contexts[index] = context;
    }
  },
  setStatus: (state, payload) => {
    const { index, status } = payload;
    if (index >= 0 && index < state.statuses.length) {
      state.statuses[index] = status;
    } else {
      // Extend array if needed
      while (state.statuses.length <= index) {
        state.statuses.push(undefined);
      }
      state.statuses[index] = status;
    }
  },
  setConversationRated: (state, payload) => {
    state.conversationRated = payload.rated;
  },
  resetChat: (state) => {
    state.messages = [];
    state.contexts = [];
    state.statuses = [];
    state.conversationRated = false;
  },
});
