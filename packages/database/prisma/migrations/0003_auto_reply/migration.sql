-- Auto-Reply Part 1 (system side): opt-in auto-reply flag + text on profiles,
-- and a seller_replies seam that records the intended reply for a match.
-- The platform send is Part 2 (blocked on a connector capability); recorded
-- rows carry status 'skipped_no_channel' until a send channel exists.

-- AlterTable: opt-in auto-reply configuration on search profiles.
ALTER TABLE "search_profiles" ADD COLUMN "auto_reply_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "search_profiles" ADD COLUMN "auto_reply_text" TEXT;

-- CreateTable
CREATE TABLE "seller_replies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'kleinanzeigen',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "body" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_replies_dedupe_key_key" ON "seller_replies"("dedupe_key");

-- CreateIndex
CREATE INDEX "seller_replies_status_created_at_idx" ON "seller_replies"("status", "created_at");

-- AddForeignKey
ALTER TABLE "seller_replies" ADD CONSTRAINT "seller_replies_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
