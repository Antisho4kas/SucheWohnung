import { createHash } from "node:crypto";
import { Worker } from "bullmq";
import { prisma as defaultPrisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";

type AutoReplyJob = {
  data: {
    matchId: string;
    event?: "created" | "changed";
    changeVersion?: string;
  };
};

type MatchRecord = {
  id: string;
  profile: {
    id: string;
    autoReplyEnabled: boolean;
    autoReplyText: string | null;
  };
  listing: {
    id: string;
    url: string;
    source: { slug: string };
  };
};

type SellerReplyRecord = {
  id: string;
  status: string;
};

type PrismaLike = {
  match: {
    findUnique(args: unknown): Promise<MatchRecord | null>;
  };
  sellerReply: {
    findUnique(args: unknown): Promise<SellerReplyRecord | null>;
    create(args: unknown): Promise<SellerReplyRecord>;
  };
};

export type AutoReplyDeps = {
  prisma: PrismaLike;
};

// Part 1 seam: no connector capability exists to actually contact the seller
// yet (that is Part 2). Recorded replies are parked in this terminal-for-now
// state so Part 2 can pick them up once a send channel is available.
const NO_CHANNEL_STATUS = "skipped_no_channel";

function createDefaultDeps(): AutoReplyDeps {
  return {
    prisma: defaultPrisma as unknown as PrismaLike,
  };
}

function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Deterministic dedupe key per (profile, listing) so a given match yields at
 * most one recorded seller reply, mirroring createTelegramDedupeKey.
 */
export function createSellerReplyDedupeKey(args: {
  profileId: string;
  listingId: string;
}): string {
  const hash = createHash("sha256")
    .update(`${args.profileId}:${args.listingId}`)
    .digest("hex");
  return `seller_reply:${hash}`;
}

export async function runAutoReplyJob(
  job: AutoReplyJob,
  deps: AutoReplyDeps = createDefaultDeps(),
): Promise<void> {
  const { matchId } = job.data;
  const match = await deps.prisma.match.findUnique({
    where: { id: matchId },
    include: {
      profile: true,
      listing: { include: { source: true } },
    },
  });

  if (!match) {
    console.warn(`[auto-reply] Match ${matchId} not found`);
    return;
  }

  const { profile, listing } = match;
  if (!profile.autoReplyEnabled) {
    console.log(
      `[auto-reply] Profile ${profile.id} auto-reply disabled, skipping match=${matchId}`,
    );
    return;
  }

  const body = profile.autoReplyText?.trim() ?? "";
  if (body.length === 0) {
    console.log(
      `[auto-reply] Profile ${profile.id} has empty auto-reply text, skipping match=${matchId}`,
    );
    return;
  }

  const dedupeKey = createSellerReplyDedupeKey({
    profileId: profile.id,
    listingId: listing.id,
  });

  const existing = await deps.prisma.sellerReply.findUnique({
    where: { dedupeKey },
  });
  if (existing) {
    console.log(
      `[auto-reply] Reply already recorded for match=${matchId} (dedupe hit)`,
    );
    return;
  }

  try {
    await deps.prisma.sellerReply.create({
      data: {
        matchId: match.id,
        channel: listing.source.slug,
        // Part 2 seam: there is no send channel yet, so the reply is recorded
        // in a terminal-for-now state instead of being dispatched.
        status: NO_CHANNEL_STATUS,
        body,
        dedupeKey,
      },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      console.log(
        `[auto-reply] Reply already recorded for match=${matchId} (concurrent dedupe hit)`,
      );
      return;
    }
    throw err;
  }

  console.log(
    `[auto-reply] recorded pending reply for match=${matchId} (no send channel yet — Part 2)`,
  );
}

if (process.env.VITEST !== "true") {
  const connection = createRedisConnection();
  const deps = createDefaultDeps();
  const worker = new Worker(
    "auto-reply",
    async (job) => runAutoReplyJob(job as AutoReplyJob, deps),
    { connection, concurrency: 3 },
  );

  worker.on("completed", (job) =>
    console.log(`[auto-reply] completed ${job.id}`),
  );
  worker.on("failed", (job, err) =>
    console.error(`[auto-reply] failed ${job?.id}`, err),
  );

  console.log("[auto-reply] Worker started");
}
