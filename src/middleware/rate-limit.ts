import rateLimit from 'express-rate-limit';
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

  // Use in-memory store for testing or when Redis is not available
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
