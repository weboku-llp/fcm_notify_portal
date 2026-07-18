import {
  QUEUE_NAMES,
  sendJobId,
  type SchedulerTickJob,
  type SendCampaignJob,
  type TokenSyncJob,
} from "@notif/contracts";
import { prisma } from "@notif/db";
import { runCampaign, syncAllEnabledProjectTokens, syncProjectTokens } from "@notif/domain";
import { createLogger } from "@notif/logger";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./env.js";

const log = createLogger("worker");

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const sendQueue = new Queue<SendCampaignJob>(QUEUE_NAMES.send, { connection });
const schedulerQueue = new Queue<SchedulerTickJob>(QUEUE_NAMES.scheduler, { connection });
const tokenSyncQueue = new Queue<TokenSyncJob>(QUEUE_NAMES.tokenSync, { connection });

const SCHEDULER_INTERVAL_MS = 30_000;
const TOKEN_SYNC_INTERVAL_MS = 5 * 60_000;

/**
 * Promote due SCHEDULED campaigns to QUEUED and enqueue a send job for each,
 * using a deterministic jobId so duplicate ticks don't double-send.
 */
async function promoteDueCampaigns(): Promise<number> {
  const now = new Date();
  const due = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true },
  });
  for (const c of due) {
    await prisma.campaign.updateMany({
      where: { id: c.id, status: "SCHEDULED" },
      data: { status: "QUEUED" },
    });
    await sendQueue.add(
      "send",
      { campaignId: c.id },
      {
        jobId: sendJobId(c.id),
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    );
  }
  if (due.length > 0) log.info({ promoted: due.length }, "promoted scheduled campaigns");
  return due.length;
}

async function registerRepeatableJobs(): Promise<void> {
  await schedulerQueue.add(
    "tick",
    {},
    {
      repeat: { every: SCHEDULER_INTERVAL_MS },
      jobId: "scheduler-tick",
      removeOnComplete: 10,
      removeOnFail: 10,
    },
  );
  log.info({ everyMs: SCHEDULER_INTERVAL_MS }, "registered repeatable scheduler");

  await tokenSyncQueue.add(
    "tick",
    {},
    {
      repeat: { every: TOKEN_SYNC_INTERVAL_MS },
      jobId: "token-sync-tick",
      removeOnComplete: 10,
      removeOnFail: 10,
    },
  );
  log.info({ everyMs: TOKEN_SYNC_INTERVAL_MS }, "registered repeatable token sync");
}

function startWorkers(): Worker[] {
  const sendWorker = new Worker<SendCampaignJob>(
    QUEUE_NAMES.send,
    async (job: Job<SendCampaignJob>) => {
      const { campaignId } = job.data;
      log.info({ campaignId, jobId: job.id }, "processing send job");
      const result = await runCampaign(campaignId);
      log.info(
        { campaignId, status: result.status, sent: result.sentCount, failed: result.failedCount },
        "send job finished",
      );
      return result;
    },
    { connection, concurrency: 5 },
  );

  const schedulerWorker = new Worker<SchedulerTickJob>(
    QUEUE_NAMES.scheduler,
    async () => {
      await promoteDueCampaigns();
    },
    { connection, concurrency: 1 },
  );

  const tokenSyncWorker = new Worker<TokenSyncJob>(
    QUEUE_NAMES.tokenSync,
    async (job: Job<TokenSyncJob>) => {
      if (job.data.projectId) {
        const result = await syncProjectTokens(job.data.projectId);
        log.info({ projectId: job.data.projectId, ...result }, "manual token sync finished");
        return result;
      }
      const result = await syncAllEnabledProjectTokens();
      log.info(result, "periodic token sync finished");
      return result;
    },
    { connection, concurrency: 1 },
  );

  for (const w of [sendWorker, schedulerWorker, tokenSyncWorker]) {
    w.on("failed", (job, err) => log.error({ jobId: job?.id, err: err.message }, "job failed"));
    w.on("error", (err) => log.error({ err: err.message }, "worker error"));
  }

  return [sendWorker, schedulerWorker, tokenSyncWorker];
}

async function main(): Promise<void> {
  log.info({ driver: env.FCM_DRIVER }, "worker starting");
  await registerRepeatableJobs();
  const workers = startWorkers();

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker shutting down");
    await Promise.all(workers.map((w) => w.close()));
    await sendQueue.close();
    await schedulerQueue.close();
    await tokenSyncQueue.close();
    await connection.quit();
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log.info("worker ready");
}

void main();
