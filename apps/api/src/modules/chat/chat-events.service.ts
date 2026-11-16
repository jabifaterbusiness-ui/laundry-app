export interface ChatRealtimeEvent {
  id: string;
  type: "message.created";
  conversationId: string;
  messageId: string;
  createdAt: string;
}

type ChatRealtimeListener = (event: ChatRealtimeEvent) => void;
const listenersByUser = new Map<string, Set<ChatRealtimeListener>>();

export function publishChatEvent(userIds: readonly string[], event: ChatRealtimeEvent): void {
  for (const userId of new Set(userIds)) {
    for (const listener of listenersByUser.get(userId) ?? []) {
      try {
        listener(event);
      } catch {
        // A disconnected browser must not interrupt delivery to other participants
        // or turn a successfully persisted message into a failed send response.
      }
    }
  }
}

export function subscribeChatEvents(
  userId: string,
  listener: ChatRealtimeListener,
): () => void {
  const listeners = listenersByUser.get(userId) ?? new Set<ChatRealtimeListener>();
  listeners.add(listener);
  listenersByUser.set(userId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByUser.delete(userId);
  };
}
