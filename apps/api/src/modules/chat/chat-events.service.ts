import { EventEmitter } from "node:events";

export interface ChatRealtimeEvent {
  id: string;
  type: "message.created";
  conversationId: string;
  messageId: string;
  createdAt: string;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publishChatEvent(userIds: readonly string[], event: ChatRealtimeEvent): void {
  for (const userId of new Set(userIds)) {
    emitter.emit(`user:${userId}`, event);
  }
}

export function subscribeChatEvents(
  userId: string,
  listener: (event: ChatRealtimeEvent) => void,
): () => void {
  const channel = `user:${userId}`;
  emitter.on(channel, listener);
  return () => emitter.off(channel, listener);
}
