import { QUEUE_NAMES, sendJobId, type SendCampaignJob } from "@notif/contracts";
import { createLogger } from "@notif/logger";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./env.js";

const log = createLogger("api:queue");

export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const sendQueue = new Queue<SendCampaignJob>(QUEUE_NAMES.send, { connection });

/**
 * Enqueue a campaign send. A deterministic jobId (`campaign-<id>`) prevents the
 * same campaign from being queued twice.
 */
export async function enqueueSend(campaignId: string): Promise<void> {
  await sendQueue.add(
    "send",
    { campaignId },
    {
      jobId: sendJobId(campaignId),
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  );
  log.info({ campaignId }, "enqueued send job");
}

export async function closeQueue(): Promise<void> {
  await sendQueue.close();
  await connection.quit();
}
