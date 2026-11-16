-- A direct conversation belongs to one user pair per business, regardless of the branch
-- from which either participant opens it. Group conversations have a NULL directKey.
CREATE UNIQUE INDEX "chat_conversations_businessId_directKey_key"
ON "chat_conversations" ("businessId", "directKey");
