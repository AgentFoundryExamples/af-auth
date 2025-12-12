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
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import pinoHttp from 'pino-http';
import { config } from './config';
import logger from './utils/logger';
import db from './db';
import { sanitizeRequestBody } from './middleware/validation';
import { performHealthCheck, performReadinessCheck, HealthStatus } from './services/health-check';

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sanitize request body to prevent prototype pollution
app.use(sanitizeRequestBody);

// HTTP request logging
app.use(
  pinoHttp({
    logger,
    autoLogging: true,
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        return 'warn';
      } else if (res.statusCode >= 500 || err) {
        return 'error';
      }
      return 'info';
    },
  })
);

/**
 * Health check endpoint.
 * Returns comprehensive service status including all critical components.
 * Used by Cloud Run health checks and monitoring systems.
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const healthResult = await performHealthCheck();
    
    // Return 200 for healthy/degraded, 503 for unhealthy
    const statusCode = healthResult.status === HealthStatus.UNHEALTHY ? 503 : 200;
    
    res.status(statusCode).json(healthResult);
  } catch (error) {
    logger.error({ error }, 'Health check endpoint error');
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * Readiness probe endpoint for Kubernetes/Cloud Run.
 * Checks if the service is ready to accept traffic.
 * Validates critical components: DB, Redis, encryption keys.
 */
app.get('/ready', async (_req: Request, res: Response) => {
  try {
    const readinessResult = await performReadinessCheck();
    
    if (readinessResult.ready) {
      res.status(200).json({
        status: 'ready',
        components: readinessResult.components,
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        reason: readinessResult.reason,
        components: readinessResult.components,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Readiness check endpoint error');
    res.status(503).json({
      status: 'not ready',
      reason: 'Readiness check failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * Liveness probe endpoint for Kubernetes/Cloud Run.
 * Checks if the service is alive (even if not fully ready).
 */
app.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * Authentication routes
 */
import authRoutes from './routes/auth';
app.use('/auth', authRoutes);

/**
 * JWT routes
 */
import jwtRoutes from './routes/jwt';
app.use('/api', jwtRoutes);
app.use('/.well-known', jwtRoutes);

/**
 * GitHub token access routes (for authorized services)
 */
import githubTokenRoutes from './routes/github-token';
app.use('/api', githubTokenRoutes);

/**
 * 404 handler for undefined routes.
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    path: req.path,
  });
});

/**
 * Global error handler.
 */
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, req }, 'Unhandled error');
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.env === 'development' ? err.message : 'An unexpected error occurred',
  });
});

/**
 * Graceful shutdown handler.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal, closing server gracefully...');
  
  server.close(async (err) => {
    if (err) {
      logger.error({ error: err }, 'Error closing server');
    } else {
      logger.info('HTTP server closed');
    }
    
    try {
      await db.disconnect();
      logger.info('Database disconnected');
      process.exit(err ? 1 : 0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Start the server.
 */
async function start() {
  try {
    logger.info({ config: { port: config.port, host: config.host, env: config.env } }, 'Starting server...');

    // Connect to database with retry logic
    await db.connect();

    // Start HTTP server
    server.listen(config.port, config.host, () => {
      logger.info(
        { port: config.port, host: config.host, env: config.env },
        'Server started successfully'
      );
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception, initiating shutdown...');
  shutdown('uncaughtException').catch(() => process.exit(1));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled promise rejection, initiating shutdown...');
  shutdown('unhandledRejection').catch(() => process.exit(1));
});

// Start the server if this file is run directly
if (require.main === module) {
  start();
}

export { app, server, start };
export default app;
