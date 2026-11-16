# LaundryAngel Chat notifications and calling delivery

## Implemented in this branch

- The authenticated application now mounts a global Chat alert manager, so alerts are not limited to the Chat page.
- A business-scoped API feed returns recent message metadata only from conversations the signed-in user still belongs to. It excludes the user's own messages and deleted messages, and does not return message bodies. Conversation membership is the access boundary; selecting a branch resets the client alert cursor but does not hide conversations in which the user remains an active participant.
- An authenticated server-sent event stream emits metadata for new messages, edits, deletions, reactions, delivery/read-state changes and conversation/group updates. Events are published after their database changes and delivered only to active participants. Channels are keyed by both business and user IDs; chat permission is rechecked before each event, disconnected listeners are isolated, and streams rotate every five minutes.
- The global browser alert manager parses chunked event frames, reconnects after the five-minute stream rotation, uses capped exponential backoff during network failures, stops retrying after authentication/permission denial, and immediately invalidates message, conversation and notification queries. REST polling remains enabled as a fallback for missed events and unavailable streaming connections.
- Users can explicitly grant desktop notification permission from the Team Chat page.
- The notification feed is scoped by the authenticated user's business and active conversation membership; the browser cannot request another tenant's notifications by supplying a business ID. The selected branch is validated by middleware, while existing conversation membership can span branches within the same business.
- Delivery receipts advance only when a participant fetches the newest unfiltered conversation page. The participant stores the latest delivered message ID/time; senders see delivered counts separately from read/seen counts. Searching or loading older history does not falsely advance delivery.
- The API returns a short conversation label rather than message contents in operating-system notifications to reduce accidental disclosure.

## Important delivery limits

The current implementation provides live in-app alerts and browser notifications while the authenticated LaundryAngel application is running. The event bus is in-process and therefore assumes one API instance; multi-instance deployments need a shared event broker. The event bus is in-process and has no durable replay; REST polling remains the recovery path for missed events. Typing/presence indicators and cross-instance fan-out are not yet implemented. It does **not** yet guarantee delivery after the browser has been fully closed. That requires a Web Push subscription lifecycle, a VAPID key pair, a push sender on the API, and a service-worker push event handler. The browser permission prompt is not itself a push subscription.

Incoming-call alerts are part of the calling milestone, but a production-ready call invitation and accept/decline lifecycle must be implemented together with the media session. We should not show an "Accept call" action that falsely implies a media connection exists before the media service is available.

## Calling architecture

Use WebRTC in the browser with a dedicated LiveKit SFU media service. Do not use peer-to-peer mesh for group calls: it multiplies upload bandwidth and CPU load for every participant and is not a stable group-call architecture.

- One-to-one audio and video: WebRTC room with two participants.
- Group audio and video: LiveKit SFU room; each client publishes once and subscribes to the selected streams.
- Network traversal: TURN enabled and tested for restrictive mobile and office networks.
- Signalling and authorization: LaundryAngel API creates short-lived, business/branch-scoped room grants after verifying that the caller belongs to the chat conversation.
- Access: only active participants in the same business and selected branch can join; tokens are short-lived and room-specific.
- Lifecycle: ringing, accepted, declined, cancelled, missed, ended, reconnecting and disconnected states must be persisted and audited.
- UX: incoming-call overlay with caller identity and call type, ringtone, accept/decline, mute, speaker, camera, hang-up, group participant grid and missed-call history.

## External configuration needed before production calling

1. Provision a separate LiveKit server (or LiveKit Cloud project) and configure its public WSS URL, API key and secret. Do not run SFU media traffic on the small application VPS.
2. Configure TURN over UDP and TLS/TCP fallback, with certificates and firewall rules. Test mobile data, office Wi-Fi, restrictive NAT and reconnect scenarios.
3. Add the LiveKit browser SDK and server-side short-lived token issuance. Keep the API secret server-side only.
4. Configure Web Push VAPID keys and the push service worker before promising closed-browser call/message delivery.
5. Serve LaundryAngel over HTTPS on its production domain; microphone, camera, service-worker push and notification APIs require secure browser contexts.
6. Load-test representative group sizes and monitor packet loss, jitter, RTT, reconnects, CPU and outbound bandwidth before enabling calls for all businesses.

## Acceptance checks

- A new message from another participant produces one alert only, never an alert for the sender's own message.
- Alerts do not cross business or branch boundaries.
- Background browser notifications require explicit permission and contain no sensitive message body.
- A branch switch clears the old branch's notification cursor and visible alert.
- Calls are not enabled for production until one-to-one and group media, TURN fallback, permissions, call-state cleanup, and reconnect behavior pass multi-device tests.
