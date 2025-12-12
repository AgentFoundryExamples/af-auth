import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';
import { getMetrics, areMetricsEnabled } from '../services/metrics';

const router = Router();

/**
 * Middleware to authenticate metrics endpoint access.
 * If METRICS_AUTH_TOKEN is configured, requires Bearer token authentication.
 */
function authenticateMetrics(req: Request, res: Response, next: Function): void {
  // If no auth token is configured, allow access (NOT recommended for production)
  if (!config.metrics.authToken) {
    logger.warn('Metrics endpoint accessed without authentication (METRICS_AUTH_TOKEN not configured)');
    return next();
  }

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    logger.warn({ ip: req.ip }, 'Metrics endpoint accessed without Authorization header');
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header required',
    });
    return;
  }

  // Validate Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn({ ip: req.ip }, 'Metrics endpoint accessed with invalid Authorization header format');
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Authorization header format. Expected: Bearer <token>',
    });
    return;
  }

  const token = parts[1];

  // Validate token (constant-time comparison to prevent timing attacks)
  const expectedToken = config.metrics.authToken;
  if (token.length !== expectedToken.length) {
    logger.warn({ ip: req.ip }, 'Metrics endpoint accessed with invalid token');
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid authentication token',
    });
    return;
  }

  // Use crypto.timingSafeEqual for constant-time comparison
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedToken);
  
  try {
    if (!crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
      logger.warn({ ip: req.ip }, 'Metrics endpoint accessed with invalid token');
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid authentication token',
      });
      return;
    }
  } catch (error) {
    // timingSafeEqual throws if buffer lengths differ (shouldn't happen due to length check above)
    logger.warn({ ip: req.ip, error }, 'Metrics endpoint token comparison failed');
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid authentication token',
    });
    return;
  }

  // Token is valid
  next();
}

/**
 * GET /metrics
 * Prometheus metrics endpoint.
 * Returns metrics in Prometheus text format.
 */
router.get(config.metrics.endpoint, authenticateMetrics, async (_req: Request, res: Response) => {
  try {
    // Check if metrics are enabled
    if (!areMetricsEnabled()) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Metrics are disabled',
      });
      return;
    }

    // Get metrics
    const metrics = await getMetrics();
    if (metrics === null) {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Metrics not available',
      });
      return;
    }

    // Return metrics in Prometheus text format
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve metrics');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve metrics',
    });
  }
});

export default router;
