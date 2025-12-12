import { Request, Response, NextFunction } from 'express';
import { recordRequestDuration } from '../services/metrics';

/**
 * Middleware to track HTTP request duration and record metrics.
 * Measures time from request start to response finish.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime();

  // Store the original end method
  const originalEnd = res.end;

  // Override res.end to capture metrics when response completes
  res.end = function (this: Response, ...args: unknown[]): Response {
    // Calculate duration
    const hrDiff = process.hrtime(startTime);
    const durationSeconds = hrDiff[0] + hrDiff[1] / 1e9;

    // Get route pattern (if available) or use path
    // Express stores the matched route in req.route
    const route = req.route?.path || req.path;

    // Record metric
    recordRequestDuration(req.method, route, res.statusCode, durationSeconds);

    // Call the original end method
    return originalEnd.apply(this, args as Parameters<typeof originalEnd>);
  };

  next();
}
