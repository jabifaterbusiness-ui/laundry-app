-- LaundryAngel internal chat foundation. Binary attachments are stored outside PostgreSQL.
CREATE TYPE "ChatConversationKind" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "ChatParticipantRole" AS ENUM ('MEMBER', 'ADMIN', 'OWNER');
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'SYSTEM');

CREATE TABLE "chat_conversations" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "kind" "ChatConversationKind" NOT NULL,
  "directKey" TEXT,
  "title" TEXT,
  "description" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_conversations_businessId_directKey_key" ON "chat_conversations"("businessId", "directKey");
CREATE INDEX "chat_conversations_businessId_lastMessageAt_idx" ON "chat_conversations"("businessId", "lastMessageAt");
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "chat_participants" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ChatParticipantRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "lastReadMessageId" TEXT,
  "lastReadAt" TIMESTAMP(3),
  "mutedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_participants_conversationId_userId_key" ON "chat_participants"("conversationId", "userId");
CREATE INDEX "chat_participants_userId_leftAt_archivedAt_idx" ON "chat_participants"("userId", "leftAt", "archivedAt");
CREATE INDEX "chat_participants_conversationId_leftAt_idx" ON "chat_participants"("conversationId", "leftAt");
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
  "body" TEXT NOT NULL,
  "replyToMessageId" TEXT,
  "clientMessageId" TEXT,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_messages_conversationId_senderUserId_clientMessageId_key" ON "chat_messages"("conversationId", "senderUserId", "clientMessageId");
CREATE INDEX "chat_messages_conversationId_createdAt_id_idx" ON "chat_messages"("conversationId", "createdAt", "id");
CREATE INDEX "chat_messages_senderUserId_createdAt_idx" ON "chat_messages"("senderUserId", "createdAt");
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "chat_attachments" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT,
  "uploadedByUserId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "safeMimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_attachments_storageKey_key" ON "chat_attachments"("storageKey");
CREATE INDEX "chat_attachments_businessId_conversationId_createdAt_idx" ON "chat_attachments"("businessId", "conversationId", "createdAt");
CREATE INDEX "chat_attachments_messageId_idx" ON "chat_attachments"("messageId");
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "chat_reactions" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_reactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_reactions_messageId_userId_emoji_key" ON "chat_reactions"("messageId", "userId", "emoji");
CREATE INDEX "chat_reactions_userId_createdAt_idx" ON "chat_reactions"("userId", "createdAt");
ALTER TABLE "chat_reactions" ADD CONSTRAINT "chat_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reactions" ADD CONSTRAINT "chat_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
