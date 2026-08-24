import { QUEUE_NAMES, sendJobId, type SendCampaignJob } from "@notif/contracts";
import { createLogger } from "@notif/logger";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./env.js";

const log = createLogger("api:queue");

function createRedis(): Redis {
  const url = env.REDIS_URL;
  const redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // Railway / managed Redis often drops idle connections; reconnect quietly.
    retryStrategy: (times) => Math.min(times * 200, 5000),
    reconnectOnError: (err) => {
      const msg = err.message || "";
      return msg.includes("ECONNRESET") || msg.includes("READONLY") || msg.includes("ETIMEDOUT");
    },
  });
  redis.on("error", (err) => {
    log.warn({ err: err.message }, "redis connection error");
  });
  return redis;
}

export const connection = createRedis();

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