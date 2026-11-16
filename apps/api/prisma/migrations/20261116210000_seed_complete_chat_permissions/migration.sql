-- Seed the complete chat permission catalogue. The application permission list is
-- authoritative; keeping these rows present allows individual and bulk grants.
INSERT INTO "permissions" ("id", "code", "module", "action", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'chat.view', 'chat', 'view', 'View own conversations and eligible colleagues', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'chat.cross_branch', 'chat', 'cross_branch', 'Discover and initiate chats with colleagues in other branches of the same business', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'chat.send_message', 'chat', 'send_message', 'Send messages and replies in conversations', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'chat.create_direct', 'chat', 'create_direct', 'Start direct conversations', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'chat.create_group', 'chat', 'create_group', 'Create group conversations', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'chat.manage_group', 'chat', 'manage_group', 'Manage groups you own or administer', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'chat.manage_all_groups', 'chat', 'manage_all_groups', 'Moderate any group in the business', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'chat.upload_attachments', 'chat', 'upload_attachments', 'Upload files to conversations', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";
