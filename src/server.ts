import { createApp } from "./app";
import { env } from "./infrastructure/config/env.config";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database/prisma.client";

async function bootstrap() {
  const app = createApp();

  // Attempt database connection
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    console.log(`=========================================`);
    console.log(` QuoteGenie Backend API running!`);
    console.log(` Environment: ${env.NODE_ENV}`);
    console.log(` Port:        ${env.PORT}`);
    console.log(` Health URL:  http://localhost:${env.PORT}/api/v1/health`);
    console.log(` Base API:    http://localhost:${env.PORT}/api/v1`);
    console.log(`=========================================`);
  });

  // Graceful shutdown
  const handleShutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log("HTTP server closed.");
      await disconnectDatabase();
      process.exit(0);
    });

    // Force shutdown after timeout if pending requests hang
    setTimeout(() => {
      console.error("Forceful shutdown after timeout.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Fatal error during bootstrap:", err);
  process.exit(1);
});
