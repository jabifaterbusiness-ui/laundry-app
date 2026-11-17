INSERT INTO "permissions" ("id", "code", "module", "action", "description", "createdAt")
VALUES (gen_random_uuid()::text, 'chat.call', 'chat', 'call', 'Start and join authorised audio and video calls', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description";
