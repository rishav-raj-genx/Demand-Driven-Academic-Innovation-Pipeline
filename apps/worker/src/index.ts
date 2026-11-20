import { Worker, Queue } from "bullmq";
import { createRedisConnection, checkRedisHealth, logger } from "./redis.js";

export const QUEUE_NAME = "sih-default-queue";

async function bootstrap() {
  logger.info("Initializing SIH Worker Service...");

  const isHealthy = await checkRedisHealth();
  if (!isHealthy) {
    logger.fatal("Failed to connect to Redis. Worker cannot start.");
    process.exit(1);
  }

  const connection = createRedisConnection();

  const queue = new Queue(QUEUE_NAME, {
    connection,
  });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, jobName: job.name }, "Processing job");
      return { processed: true, timestamp: new Date().toISOString() };
    },
    { connection }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Job completed successfully");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, "Job failed");
  });

  logger.info({ queue: QUEUE_NAME }, "Worker initialized and listening for jobs");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down worker gracefully...");
    await worker.close();
    await queue.close();
    await connection.quit();
    logger.info("Worker shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (process.argv.includes("--check")) {
  checkRedisHealth()
    .then((ok) => {
      if (!ok) {
        process.exit(1);
      }
      logger.info("Redis health verification succeeded");
      process.exit(0);
    })
    .catch((err: unknown) => {
      logger.error({ err }, "Redis health verification encountered an error");
      process.exit(1);
    });
} else {
  bootstrap().catch((err: unknown) => {
    logger.fatal({ err }, "Fatal error during worker bootstrap");
    process.exit(1);
  });
}
