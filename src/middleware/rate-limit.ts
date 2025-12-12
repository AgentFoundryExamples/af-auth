import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient, isRedisConnected, getRedisStatus } from '../services/redis-client';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Creates a rate limiting middleware with Redis store for distributed rate limiting.
 * Falls back to in-memory store if Redis is unavailable.
 * 
 * @param options - Rate limiting configuration
 * @returns Express rate limiting middleware
 */
function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message: string;
}) {
  const { windowMs, maxRequests, keyPrefix, message } = options;

  // Base configuration
  const baseConfig: any = {
    windowMs,
    max: maxRequests,
    message: { error: 'RATE_LIMIT_EXCEEDED', message },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    handler: (req: any, res: any) => {
      logger.warn(
        {
          ip: req.ip,
          path: req.path,
          method: req.method,
          keyPrefix,
        },
        'Rate limit exceeded'
      );
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message,
      });
    },
  };

  // Use Redis store if connected, otherwise fall back to in-memory store
  try {
    const redisClient = getRedisClient();
    if (isRedisConnected() && redisClient && redisClient.status === 'ready') {
      const store = new RedisStore({
        // @ts-expect-error - Known issue with ioredis v5 and express-rate-limit
        sendCommand: (...args: string[]) => redisClient.call(...args),
        prefix: `rate-limit:${keyPrefix}:`,
      });
      baseConfig.store = store;
      logger.debug({ keyPrefix }, 'Rate limiting with Redis store');
    } else {
      logger.warn(
        { keyPrefix, redisStatus: getRedisStatus() },
        'Rate limiting with in-memory store. Redis is not connected.'
      );
    }
  } catch (error) {
    logger.warn(
      { keyPrefix, redisStatus: getRedisStatus(), error },
      'Failed to create Redis store for rate limiting. Using in-memory store.'
    );
  }

  return rateLimit(baseConfig);
}

/**
 * Rate limiter for authentication endpoints.
 * Applies strict limits to prevent brute force attacks.
 */
export const authRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.auth.windowMs,
  maxRequests: config.rateLimit.auth.maxRequests,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please try again later.',
});

/**
 * Rate limiter for JWT endpoints.
 * Moderate limits for token issuance and refresh.
 */
export const jwtRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.jwt.windowMs,
  maxRequests: config.rateLimit.jwt.maxRequests,
  keyPrefix: 'jwt',
  message: 'Too many token requests. Please try again later.',
});

/**
 * Rate limiter for GitHub token access endpoint.
 * Higher limits for authorized service-to-service calls.
 */
export const githubTokenRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.githubToken.windowMs,
  maxRequests: config.rateLimit.githubToken.maxRequests,
  keyPrefix: 'github-token',
  message: 'Too many GitHub token requests. Please try again later.',
});
