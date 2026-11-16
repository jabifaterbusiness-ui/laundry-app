export interface ChatRealtimeEvent {
  id: string;
  type: "message.created" | "message.updated" | "message.deleted" | "message.reaction" | "conversation.read" | "conversation.updated";
  conversationId: string;
  messageId?: string;
  actorUserId?: string;
  createdAt: string;
}

type ChatRealtimeListener = (event: ChatRealtimeEvent) => void;
const listenersByUser = new Map<string, Set<ChatRealtimeListener>>();

export function publishChatEvent(businessId: string, userIds: readonly string[], event: ChatRealtimeEvent): void {
  for (const userId of new Set(userIds)) {
    for (const listener of listenersByUser.get(`${businessId}:${userId}`) ?? []) {
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
  businessId: string,
  userId: string,
  listener: ChatRealtimeListener,
): () => void {
  const channel = `${businessId}:${userId}`;
  const listeners = listenersByUser.get(channel) ?? new Set<ChatRealtimeListener>();
  listeners.add(listener);
  listenersByUser.set(channel, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByUser.delete(channel);
  };
}
