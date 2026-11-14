import { Request, Response } from "express";
import { prisma } from "../../infrastructure/database/prisma.client";

export class HealthController {
  async check(_req: Request, res: Response): Promise<void> {
    let databaseStatus = "disconnected";
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseStatus = "connected";
    } catch {
      databaseStatus = "unreachable";
    }

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "quotegenie-backend",
      database: databaseStatus,
      uptime: process.uptime(),
    });
  }
}
