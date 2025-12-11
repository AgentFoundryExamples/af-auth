import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Sleep utility for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exponential backoff calculation.
 */
function getBackoffDelay(attempt: number, baseDelay: number): number {
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Extended Prisma Client with custom configuration.
 */
class DatabaseClient {
  private client: PrismaClient;
  private isConnected = false;

  constructor() {
    this.client = new PrismaClient({
      datasources: {
        db: {
          url: config.database.url,
        },
      },
    });
  }

  /**
   * Connect to the database with retry logic.
   * Uses exponential backoff for retries.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.debug('Database already connected');
      return;
    }

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < config.database.maxRetries; attempt++) {
      try {
        logger.info(
          { attempt: attempt + 1, maxRetries: config.database.maxRetries },
          'Attempting to connect to database'
        );

        await this.client.$connect();
        
        // Verify connection with a simple query
        await this.client.$queryRaw`SELECT 1`;
        
        this.isConnected = true;
        logger.info('Database connected successfully');
        return;
      } catch (error) {
        lastError = error as Error;
        const delay = getBackoffDelay(attempt, config.database.retryDelay);
        
        logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: config.database.maxRetries,
            nextRetryIn: delay,
            error: lastError.message,
          },
          'Database connection failed, retrying...'
        );

        if (attempt < config.database.maxRetries - 1) {
          await sleep(delay);
        }
      }
    }

    logger.error(
      { error: lastError?.message },
      'Failed to connect to database after all retries'
    );
    throw new Error(
      `Failed to connect to database after ${config.database.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Disconnect from the database.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.$disconnect();
      this.isConnected = false;
      logger.info('Database disconnected');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting from database');
      throw error;
    }
  }

  /**
   * Check if the database is healthy.
   * @returns true if database is accessible, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      return false;
    }
  }

  /**
   * Get the underlying Prisma client.
   * Use this for database operations.
   */
  get prisma(): PrismaClient {
    return this.client;
  }

  /**
   * Get connection status.
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
export const db = new DatabaseClient();

// Export Prisma client for direct usage
export const prisma = db.prisma;

export default db;
