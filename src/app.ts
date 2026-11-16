import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./infrastructure/config/env.config";
import { apiRoutes } from "./presentation/routes";
import { errorHandler } from "./presentation/middlewares/error.middleware";
import { notFoundHandler } from "./presentation/middlewares/not-found.middleware";

export function createApp(): Application {
  const app = express();

  // Security & utility middlewares
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use("/api/v1", apiRoutes);

  // Error handling middlewares
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
