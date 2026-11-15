# LaundryAngel in-app messaging — implementation specification

Status: approved product scope; implementation and verification pending. This document is the engineering contract for the messaging module.

## Product outcome

Deliver a polished, responsive, WhatsApp-familiar internal communication workspace inside LaundryAngel. It is a first-class application module, not an external WhatsApp integration. Users can start direct conversations with eligible colleagues. Explicitly authorised users can create group conversations with selected eligible colleagues or all eligible users in their business.

## Experience and navigation

- Add a dedicated **Chat** entry to the authenticated application navigation, with an unread badge.
- Desktop: three-pane workspace where space permits — conversation navigation/search, active message timeline/composer, and optional conversation details.
- Mobile: conversation list and conversation view become navigable screens with a clear back action.
- Conversation list: avatar/group image, title, last-message preview, timestamp, unread count, muted state, and pinned state.
- Empty state: attractive invitation to start a conversation; loading skeletons, error/retry states, and useful empty search states.
- Composer: multiline text, emoji picker, attachment picker, upload progress, previews, remove-before-send, send state, and keyboard-accessible controls.
- Timeline: date separators, grouped messages, sender identity, timestamps, edited/deleted markers, attachment cards/previews, reply context, reactions, and read state.
- Group details: name, description, image, participant list, roles, membership actions, and group settings.

## Capabilities

### Direct conversations
- Search and select an eligible colleague to initiate a one-to-one conversation.
- Enforce one canonical direct conversation per unordered pair of users within a business (avoid duplicate threads from opposite initiation directions).
- Only participants can read or send messages.

### Group conversations
- Group creation requires an explicit permission.
- Creator can select individual eligible users or choose **all eligible users** in the creator's business; show the participant count and require confirmation before creating a large group.
- All-users selection is resolved server-side at creation time. Never accept arbitrary cross-business user IDs.
- Group owner/admin permissions control title/description/image changes, adding/removing members, and admin promotion/demotion.
- Membership changes are persisted as system events in the timeline.
- A member who leaves or is removed loses access to future conversation content according to the defined retention policy; do not silently expose a conversation to non-members.

### Messages and collaboration
- Text and Unicode emoji support.
- Image, PDF, office document and other explicitly allowed file attachments, subject to server-side size/type limits.
- Image/document previews where safe; downloads must pass the same conversation-membership authorization as message reads.
- Reply-to-message context, emoji reactions, edit own message within a configured window, and soft-delete own message with an audit/system marker.
- Per-user read cursor/read receipts and unread counts; delivery/read state must be server-persisted.
- Typing and presence indicators are best-effort, ephemeral features and must not be treated as authoritative audit records.
- Conversation mute/pin/archive and message search can be delivered in the first release if scope and performance permit; do not sacrifice core authorization and persistence to ship cosmetic extras.

## Security, tenancy and permissions

- Business isolation is mandatory. A conversation has one businessId; every participant must be an active user of that same business. No cross-business chat in this release.
- Branch visibility is an additional eligibility filter: users may communicate with colleagues in the same business, but directory discovery should respect branch membership and explicit cross-branch communication policy. A business owner or platform admin must not accidentally inherit access to private conversations merely from their role.
- Derive business and user identity from the authenticated server session. Never trust client-supplied businessId, senderId, read state, role, or membership.
- Suggested permission keys, to be registered in the permission catalogue and seeded consistently:
  - chat.view — access own conversations and colleague directory.
  - chat.create_direct — initiate a direct conversation.
  - chat.create_group — create group conversations.
  - chat.manage_group — manage group metadata and members where the actor is a group owner/admin.
  - chat.manage_all_groups — exceptional business-level moderation, separately granted.
  - chat.upload_attachments — upload files to conversations.
- Group permissions are not inferred from job title. Business Owner/platform-level defaults must be implemented through the existing effective-permission system, while ordinary users require explicit grants.
- Enforce authorization in every REST endpoint and realtime event handler, not just navigation/UI.
- Rate-limit message creation, group creation, directory search and uploads. Validate/normalize message payloads. Escape/render message text safely; never render user HTML.
- Audit privileged group moderation and membership actions. Do not log message bodies or attachment contents in general audit logs.

## Suggested data model

Use tenant-scoped relational models (names are provisional; reconcile with existing Prisma conventions before migration):

- ChatConversation: id, businessId, kind (DIRECT/GROUP), title, description, image attachment reference, createdByUserId, createdAt, updatedAt, lastMessageAt, archivedAt.
- ChatParticipant: id, conversationId, userId, role (MEMBER/ADMIN/OWNER), joinedAt, leftAt, lastReadMessageId, lastReadAt, mutedAt, archivedAt. Unique active membership constraints should prevent duplicates.
- ChatMessage: id, conversationId, senderUserId, body, replyToMessageId, editedAt, deletedAt, createdAt, clientMessageId (idempotency).
- ChatAttachment: id, businessId, conversationId, messageId, uploadedByUserId, storageKey, originalName, safeMimeType, sizeBytes, checksum, createdAt, deletedAt.
- ChatReaction: id, messageId, userId, emoji, createdAt; unique(messageId,userId,emoji).
- ChatMessageRead / receipt cursor only if participant cursor cannot meet required per-message semantics; prefer cursor-based read receipts to avoid a row per message per recipient.
- ChatEvent (or typed system messages) for group lifecycle and moderation events.

Add indexes for (businessId, lastMessageAt), (conversationId, createdAt), (userId, leftAt), and unread/read-cursor queries. Ensure foreign keys and cascade behavior are deliberate; preserve audit/history where required.

## API and real-time design

- Keep REST as the source of truth for conversation discovery, history pagination, group administration, attachment upload/download authorization and read-cursor updates.
- Add Socket.IO (or a documented equivalent) on the existing Express HTTP server after confirming server lifecycle, reverse-proxy WebSocket support and deployment health checks.
- Authenticate socket handshakes with the same access-token validation used by REST. Join server-authorized rooms only after checking current participant membership. Re-check membership for every message/room action; never let a client join arbitrary room names.
- Persist a message transactionally before broadcasting it. Use clientMessageId for retry-safe idempotency and acknowledge the canonical persisted message.
- Reconnect by fetching messages after the last persisted cursor; do not rely on socket delivery as durable storage.
- Events: conversation.created, conversation.updated, message.created, message.updated, message.deleted, message.reaction.updated, participant.updated, conversation.read, typing.updated, presence.updated.
- Use cursor pagination and bounded payload sizes. Do not broadcast attachment bytes over sockets.

## Attachment storage

- Use private object storage or a private persistent storage volume with random storage keys; never expose raw filesystem paths or public bucket URLs.
- Upload through an authenticated, rate-limited endpoint with streaming size limits, extension/MIME/content-signature checks, safe filename handling and malware-scanning hook where available.
- Download/preview endpoints must verify active conversation membership and attachment ownership/association before streaming or issuing a short-lived signed URL.
- Define allowed MIME types and maximum file size in server configuration. Block executable/script formats by default. Avoid trusting browser Content-Type.
- Keep attachment metadata in PostgreSQL; keep binary content out of PostgreSQL and socket events.

## Notifications and UX quality

- Update in-app unread badges promptly and persist unread state across devices.
- Integrate with the existing notification/inbox pattern without exposing message contents in logs or unauthorised notification previews.
- Respect mute settings and avoid generating notifications for the sender's own messages.
- Accessibility: keyboard navigation, visible focus, labelled controls, screen-reader announcements for new messages, adequate contrast and reduced-motion support.
- Responsive polished visual language consistent with LaundryAngel's SaaS/ERP shell.

## Delivery sequence

1. Confirm existing auth/session middleware, Express server bootstrap, permission catalogue, Prisma conventions, file storage/deployment volumes, reverse proxy WebSocket support and notification infrastructure.
2. Add Prisma models and additive migration; generate client and verify migration against a disposable database before production.
3. Implement permission seeding and REST services/controllers with business isolation and membership checks.
4. Implement private attachment upload/download.
5. Add authenticated Socket.IO transport, persistence-before-broadcast, reconnect and idempotency.
6. Build responsive Chat UI, colleague picker, direct/group flows, message timeline, composer, emoji and attachment UX.
7. Add read cursors, unread counts, reactions, replies, group management and notification integration.
8. Add API security tests, tenancy tests, socket authorization tests, upload validation tests, frontend component tests and end-to-end multi-user tests.
9. Verify behind the actual Nginx/Docker deployment topology, including WebSocket upgrade headers, resource limits, reconnect behavior and backup/restore implications.
10. Only after successful staging and explicit release approval, merge/deploy. Never run production migrations or deploy as part of this specification-only preparation.

## Acceptance criteria

- Two eligible users can create and exchange direct messages; a third user cannot read the conversation or join its realtime room.
- An ordinary user without chat permissions cannot open the module or call protected APIs directly.
- A user without chat.create_group cannot create groups, including by crafting requests.
- An authorised group creator can select users or all eligible users from their business; cross-business IDs are rejected server-side.
- Removed/left members cannot fetch later messages, attachments or realtime events.
- Messages survive refresh, reconnect, multiple devices and transient socket failures without duplicate sends.
- Unread counts and read cursors are consistent across devices.
- Upload validation rejects oversized, spoofed and disallowed files; attachment URLs do not bypass membership checks.
- Emoji, replies, reactions, image/document attachments and group membership events render correctly on desktop and mobile.
- Automated tests and production-like staging checks pass before merge/deploy.
