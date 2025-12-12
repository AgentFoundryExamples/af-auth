// Copyright 2025 John Brosnihan
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient, isRedisConnected, getRedisStatus } from '../services/redis-client';
import { config } from '../config';
import logger from '../utils/logger';
import { recordRateLimitHit } from '../services/metrics';

/**
 * Creates a rate limiting middleware with Redis store for distributed rate limiting.
 * Falls back to in-memory store if Redis is unavailable.
 * 
 * @param options - Rate limiting configuration
 * @returns Express rate limiting middleware wrapped with metrics tracking
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
      recordRateLimitHit(keyPrefix, 'blocked');
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

  const limiter = rateLimit(baseConfig);
  
  // Wrap the limiter to track allowed requests
  // Note: We record 'allowed' for all requests that pass through the rate limiter
  // The 'blocked' metric is recorded in the handler above when rate limit is exceeded
  return (req: any, res: any, next: any) => {
    const originalNext = next;
    const wrappedNext = (err?: any) => {
      // Only record 'allowed' if the response wasn't already sent by the handler (status 429)
      if (res.statusCode !== 429) {
        recordRateLimitHit(keyPrefix, 'allowed');
      }
      originalNext(err);
    };
    
    limiter(req, res, wrappedNext);
  };
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
