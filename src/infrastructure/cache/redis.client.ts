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

  async delByPattern(pattern: string): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        console.log(`🗑️ Removed ${keys.length} keys matching "${pattern}" from Redis cache.`);
      }
    } catch (err) {
      console.warn(`Redis delByPattern error for pattern "${pattern}":`, err);
    }
  }

  private memoryRateLimitStore = new Map<string, { count: number; resetAt: number }>();

  /**
   * Distributed rate limit check with atomic Redis counters and in-memory fallback.
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; current: number; remaining: number; resetInSeconds: number }> {
    if (this.client && this.isConnected) {
      try {
        const pipeline = this.client.pipeline();
        pipeline.incr(key);
        pipeline.ttl(key);
        const results = await pipeline.exec();

        if (results && results[0] && !results[0][0]) {
          const count = Number(results[0][1]);
          let ttl = Number(results[1]?.[1]);

          // If this is the initial hit or key lacked an expiry, assign TTL
          if (count === 1 || ttl === -1) {
            await this.client.expire(key, windowSeconds);
            ttl = windowSeconds;
          }

          const resetInSeconds = ttl > 0 ? ttl : windowSeconds;
          const remaining = Math.max(0, limit - count);
          const allowed = count <= limit;

          return { allowed, current: count, remaining, resetInSeconds };
        }
      } catch (err) {
        console.warn(`Redis rate limit error for key "${key}":`, err);
      }
    }

    // In-memory fallback if Redis is disconnected
    return this.memoryRateLimit(key, limit, windowSeconds);
  }

  private memoryRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): { allowed: boolean; current: number; remaining: number; resetInSeconds: number } {
    const now = Date.now();
    const entry = this.memoryRateLimitStore.get(key);

    if (!entry || now > entry.resetAt) {
      const resetAt = now + windowSeconds * 1000;
      this.memoryRateLimitStore.set(key, { count: 1, resetAt });
      return { allowed: true, current: 1, remaining: limit - 1, resetInSeconds: windowSeconds };
    }

    entry.count += 1;
    const resetInSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    const remaining = Math.max(0, limit - entry.count);
    const allowed = entry.count <= limit;

    return { allowed, current: entry.count, remaining, resetInSeconds };
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
