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
