-- Make the dedicated cross-branch chat capability available to the permission manager.
INSERT INTO "permissions" ("id", "code", "module", "action", "description", "createdAt")
VALUES (
  gen_random_uuid()::text,
  'chat.cross_branch',
  'chat',
  'cross_branch',
  'Discover and initiate chats with colleagues in other branches of the same business',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";
