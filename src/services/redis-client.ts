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
import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Redis client instance for distributed state storage
 * Supports multi-instance deployments (Cloud Run autoscaling, Kubernetes)
 */
let redisClient: Redis | null = null;

/**
 * Get or create Redis client with connection retry logic
 */
export function getRedisClient(): Redis {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  if (redisClient && redisClient.status === 'connecting') {
    // Return existing client that's still connecting
    return redisClient;
  }

  const redisOptions: RedisOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    connectTimeout: config.redis.connectTimeout,
    maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
    retryStrategy: (times: number) => {
      if (times > config.redis.maxRetries) {
        logger.error(
          { attempts: times, maxRetries: config.redis.maxRetries },
          'Redis connection retry limit exceeded'
        );
        return null; // Stop retrying
      }

      const delay = Math.min(times * config.redis.retryDelay, 3000);
      logger.warn(
        { attempts: times, delayMs: delay },
        'Retrying Redis connection'
      );
      return delay;
    },
    enableOfflineQueue: false, // Fail fast when disconnected
    lazyConnect: false, // Connect immediately
  };

  logger.info(
    {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      hasPassword: !!config.redis.password,
    },
    'Initializing Redis client'
  );

  redisClient = new Redis(redisOptions);

  // Connection event handlers
  redisClient.on('connect', () => {
    logger.info('Redis client connected successfully');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready for commands');
  });

  redisClient.on('error', (error: Error) => {
    logger.error(
      { error: error.message },
      'Redis client error'
    );
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', (delay: number) => {
    logger.info({ delayMs: delay }, 'Redis client reconnecting');
  });

  redisClient.on('end', () => {
    logger.warn('Redis connection ended');
  });

  return redisClient;
}

/**
 * Check if Redis is connected and ready
 */
export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.status === 'ready';
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): string {
  return redisClient?.status || 'disconnected';
}

/**
 * Gracefully disconnect Redis client
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    logger.info('Disconnecting Redis client');
    try {
      await redisClient.quit();
      logger.info('Redis client disconnected successfully');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting Redis client');
      // Force disconnect
      redisClient.disconnect();
    }
    redisClient = null;
  }
}

/**
 * Redis operation error wrapper with user-friendly messages
 */
export class RedisOperationError extends Error {
  public readonly userMessage: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    userMessage: string,
    requestId?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'RedisOperationError';
    this.userMessage = userMessage;
    this.requestId = requestId;
  }
}

/**
 * Execute Redis operation with error handling and logging
 */
export async function executeRedisOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  requestId?: string
): Promise<T> {
  const startTime = Date.now();

  try {
    logger.debug({ operation: operationName, requestId }, 'Executing Redis operation');

    const result = await operation();

    const duration = Date.now() - startTime;
    logger.debug(
      { operation: operationName, requestId, durationMs: duration },
      'Redis operation completed'
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        operation: operationName,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: duration,
      },
      'Redis operation failed'
    );

    // Map technical errors to user-friendly messages
    const userMessage =
      'We are experiencing technical difficulties. Please try again in a few moments.';

    throw new RedisOperationError(
      `Redis operation '${operationName}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      userMessage,
      requestId,
      error instanceof Error ? error : undefined
    );
  }
}

// Initialize Redis client on module load
// Use a try-catch to prevent startup failures in test environments
try {
  getRedisClient();
} catch (error) {
  logger.error({ error }, 'Failed to initialize Redis client on startup');
}
