import Redis from "ioredis";

export class RedisClient {
  private client: Redis | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      console.log("ℹ️ No REDIS_URL configured; running without Redis cache.");
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        connectTimeout: 8000,
        lazyConnect: false,
        tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
      });

      this.client.on("connect", () => {
        this.isConnected = true;
        console.log("✅ Upstash Redis Cache connected successfully.");
      });

      this.client.on("ready", () => {
        this.isConnected = true;
      });

      this.client.on("error", (err) => {
        this.isConnected = false;
        console.warn("⚠️ Redis warning (cache fallback active):", err.message);
      });

      this.client.on("close", () => {
        this.isConnected = false;
      });
    } catch (err) {
      console.warn("⚠️ Failed to initialize Redis client:", err);
      this.client = null;
    }
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null && this.client.status === "ready";
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      console.warn(`Redis get error for key "${key}":`, err);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number = 86400): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.set(key, value, "EX", ttlSeconds);
    } catch (err) {
      console.warn(`Redis set error for key "${key}":`, err);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.del(key);
    } catch (err) {
      console.warn(`Redis del error for key "${key}":`, err);
    }
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
