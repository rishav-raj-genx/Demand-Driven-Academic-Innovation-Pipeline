import { Worker, type Job } from "bullmq";
import { prisma, recordAuditLog } from "@sih/db";
import { createRedisConnection, checkRedisHealth, logger } from "./redis.js";
import {
  QUEUE_NAMES,
  type ChallengeProcessJobData,
  type HeiEmbedJobData,
  type NotificationJobData,
} from "./types.js";
import { allQueues, enqueueDeadLetter } from "./queues.js";
import { challengeProcessor } from "./processors/challenge-processor.js";
import { heiEmbedProcessor } from "./processors/hei-embed-processor.js";
import { notificationProcessor } from "./processors/notification-processor.js";
import { aiClient } from "./clients/ai-client.js";

async function handleDeadLetter(workerName: string, job: Job | undefined, err: Error) {
  if (!job) {
    logger.error({ workerName, error: err.message }, "Dead-letter event received without job payload");
    return;
  }

  const maxAttempts = job.opts.attempts ?? 3;
  if (job.attemptsMade >= maxAttempts) {
    logger.error(
      {
        jobId: job.id,
        jobName: job.name,
        queue: workerName,
        attemptsMade: job.attemptsMade,
        maxAttempts,
        error: err.message,
        data: job.data,
      },
      "🚨 Job retries exhausted -> Dispatching to Dead-Letter Queue"
    );

    try {
      await enqueueDeadLetter({
        originalQueue: workerName,
        originalJobId: job.id,
        originalJobName: job.name,
        originalData: job.data,
        attemptsMade: job.attemptsMade,
        failedReason: err.message,
        failedAt: new Date().toISOString(),
        stackTrace: err.stack,
      });

      await recordAuditLog({
        action: "JOB_DEAD_LETTER",
        entityType: "BullMQJob",
        entityId: job.id ?? "unknown",
        metadata: {
          queue: workerName,
          name: job.name,
          attemptsMade: job.attemptsMade,
          maxAttempts,
          error: err.message,
        },
      });
    } catch (dlqErr) {
      logger.error(
        { dlqErr, jobId: job.id },
        "Failed to dispatch job to Dead-Letter Queue or record audit log"
      );
    }
  }
}

export async function bootstrap() {
  logger.info("Initializing SIH26043 Multi-Queue BullMQ Worker Service...");

  const isHealthy = await checkRedisHealth();
  if (!isHealthy) {
    logger.fatal("Failed to connect to Redis. Worker cannot start.");
    process.exit(1);
  }

  const workers: Worker[] = [];

  function createSubWorker<T>(
    queueName: string,
    processor: (job: Job<T>) => Promise<unknown>
  ): Worker<T> {
    const worker = new Worker<T>(
      queueName,
      async (job: Job<T>) => {
        logger.info(
          { jobId: job.id, jobName: job.name, queue: queueName, attempt: job.attemptsMade + 1 },
          "Job processing started"
        );
        return processor(job);
      },
      {
        connection: createRedisConnection(),
        concurrency: 5,
      }
    );

    worker.on("completed", (job: Job<T>) => {
      logger.info(
        { jobId: job.id, jobName: job.name, queue: queueName },
        "Job completed successfully"
      );
    });

    worker.on("failed", (job: Job<T> | undefined, err: Error) => {
      logger.warn(
        {
          jobId: job?.id,
          jobName: job?.name,
          queue: queueName,
          attemptsMade: job?.attemptsMade,
          error: err.message,
        },
        "Job processing attempt failed"
      );
      void handleDeadLetter(queueName, job, err);
    });

    worker.on("error", (err: Error) => {
      logger.error({ queue: queueName, error: err.message }, "Worker internal error");
    });

    return worker;
  }

  // 1. Challenge Intake & Analysis Workers (canonical and legacy queue names)
  workers.push(
    createSubWorker<ChallengeProcessJobData>(
      QUEUE_NAMES.CHALLENGE_PROCESS,
      challengeProcessor
    )
  );
  workers.push(
    createSubWorker<ChallengeProcessJobData>(
      QUEUE_NAMES.CHALLENGE_PIPELINE,
      challengeProcessor
    )
  );

  // 2. HEI Capability Embedding Workers
  workers.push(
    createSubWorker<HeiEmbedJobData>(
      QUEUE_NAMES.HEI_EMBED,
      heiEmbedProcessor
    )
  );
  workers.push(
    createSubWorker<HeiEmbedJobData>(
      QUEUE_NAMES.HEI_EMBEDDING,
      heiEmbedProcessor
    )
  );

  // 3. Mock SMS Notification Workers
  workers.push(
    createSubWorker<NotificationJobData>(
      QUEUE_NAMES.NOTIFY_SMS,
      notificationProcessor
    )
  );
  workers.push(
    createSubWorker<NotificationJobData>(
      QUEUE_NAMES.NOTIFICATION_DISPATCH,
      notificationProcessor
    )
  );

  logger.info(
    {
      activeQueues: [
        QUEUE_NAMES.CHALLENGE_PROCESS,
        QUEUE_NAMES.CHALLENGE_PIPELINE,
        QUEUE_NAMES.HEI_EMBED,
        QUEUE_NAMES.HEI_EMBEDDING,
        QUEUE_NAMES.NOTIFY_SMS,
        QUEUE_NAMES.NOTIFICATION_DISPATCH,
      ],
      concurrencyPerQueue: 5,
    },
    "All BullMQ workers initialized and actively listening for jobs"
  );

  let shuttingDown = false;
  const shutdown = async (
    signal: string,
    options: { exitProcess?: boolean } = { exitProcess: true }
  ) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Received shutdown signal. Closing workers gracefully...");

    try {
      await Promise.allSettled(workers.map((w) => w.close()));
      await Promise.allSettled(allQueues.map((q) => q.close()));
      await prisma.$disconnect();
      logger.info("BullMQ Worker Service shutdown completed cleanly");
      if (options.exitProcess ?? true) {
        process.exit(0);
      }
    } catch (err) {
      logger.error({ err }, "Error during graceful worker shutdown");
      if (options.exitProcess ?? true) {
        process.exit(1);
      }
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  return { workers, shutdown };
}

if (process.argv.includes("--check")) {
  Promise.all([
    checkRedisHealth(),
    prisma.$queryRaw`SELECT 1 as db_ok`,
    aiClient.checkHealth().catch(() => ({ status: "unavailable", pgvector: false })),
  ])
    .then(([redisOk, dbResult, aiResult]) => {
      if (!redisOk || !dbResult) {
        logger.fatal({ redisOk, dbOk: Boolean(dbResult) }, "Worker prerequisite checks failed");
        process.exit(1);
      }
      logger.info(
        { redis: "OK", db: "OK", aiEngine: aiResult.status },
        "Worker environment and dependencies verification succeeded"
      );
      process.exit(0);
    })
    .catch((err: unknown) => {
      logger.error({ err }, "Worker health verification encountered an error");
      process.exit(1);
    });
} else if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((err: unknown) => {
    logger.fatal({ err }, "Fatal error during worker bootstrap");
    process.exit(1);
  });
}

export { heiEmbedProcessor } from "./processors/hei-embed-processor.js";
export { challengeProcessor } from "./processors/challenge-processor.js";
export { notificationProcessor } from "./processors/notification-processor.js";
export { aiClient } from "./clients/ai-client.js";
export * from "./types.js";
