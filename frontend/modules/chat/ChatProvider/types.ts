import { Message } from '@/hooks/use-chat';
import { DocumentWithChunk } from '@/server/routers/search';

export type Action =
  | { type: 'setMessages'; payload: { messages: Message[] } }
  | { type: 'addMessage'; payload: { message: Message } }
  | { type: 'updateMessage'; payload: { index: number; message: Message } }
  | { type: 'clearMessages' }
  | { type: 'setContext'; payload: { index: number; context: DocumentWithChunk[] | undefined } }
  | { type: 'setStatus'; payload: { index: number; status: boolean | undefined } }
  | { type: 'setConversationRated'; payload: { rated: boolean } }
  | { type: 'resetChat' };

export type ActionType = Action['type'];

export type Dispatch = (action: Action) => void;

export type State = {
  messages: Message[];
  contexts: (DocumentWithChunk[] | undefined)[];
  statuses: (boolean | undefined)[];
  conversationRated: boolean;
};
