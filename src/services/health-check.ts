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
import db from '../db';
import { getRedisClient, isRedisConnected } from './redis-client';
import { config } from '../config';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { areMetricsEnabled, getRegistry } from './metrics';

/**
 * Health status for individual components
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DEGRADED = 'degraded',
}

/**
 * Component health check result
 */
export interface ComponentHealth {
  status: HealthStatus;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Overall health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  environment: string;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    encryption: ComponentHealth;
    githubApp: ComponentHealth;
    metrics?: ComponentHealth;
  };
}

/**
 * GitHub App token check result cache
 * Caches successful checks to avoid hammering GitHub API
 * 
 * NOTE: This cache is stored in module-level state and is instance-specific.
 * In Cloud Run with multiple instances, each instance maintains its own cache.
 * This is acceptable as health checks are evaluated per-instance and the cache
 * prevents rate limiting on each individual instance. Cache is cleared on restart.
 */
interface GithubAppCheckCache {
  status: HealthStatus;
  timestamp: number;
  message?: string;
}

let githubAppCheckCache: GithubAppCheckCache | null = null;
const GITHUB_APP_CACHE_TTL_MS = 60000; // 1 minute cache
const MIN_ENCRYPTION_KEY_LENGTH = 32; // Minimum length for AES-256 encryption key
const JWT_TEST_CLOCK_OFFSET_SECONDS = 60; // Allow 60 seconds for clock skew in test JWT

/**
 * Check database health and SSL connectivity
 */
export async function checkDatabaseHealth(): Promise<ComponentHealth> {
  try {
    // Check basic connectivity
    const isHealthy = await db.healthCheck();
    
    if (!isHealthy) {
      logger.warn('Database health check failed');
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Database is not responding',
        details: {
          connected: db.connected,
          sslEnabled: config.database.ssl.enabled,
        },
      };
    }

    // Verify SSL is enabled in production
    if (config.env === 'production' && !config.database.ssl.enabled) {
      logger.warn('Database SSL is not enabled in production');
      return {
        status: HealthStatus.DEGRADED,
        message: 'Database SSL is not enabled',
        details: {
          connected: true,
          sslEnabled: false,
        },
      };
    }

    return {
      status: HealthStatus.HEALTHY,
      details: {
        connected: true,
        sslEnabled: config.database.ssl.enabled,
      },
    };
  } catch (error) {
    logger.error({ error }, 'Database health check error');
    return {
      status: HealthStatus.UNHEALTHY,
      message: error instanceof Error ? error.message : 'Unknown error',
      details: {
        connected: db.connected,
      },
    };
  }
}

/**
 * Check Redis health and connectivity
 */
export async function checkRedisHealth(): Promise<ComponentHealth> {
  try {
    const redis = getRedisClient();
    const connected = isRedisConnected();

    if (!connected) {
      logger.warn('Redis is not connected', { status: redis.status });
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Redis is not connected',
        details: {
          connectionStatus: redis.status,
        },
      };
    }

    // Perform a simple PING operation
    const pingResult = await redis.ping();
    
    if (pingResult !== 'PONG') {
      logger.warn('Redis PING failed', { result: pingResult });
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Redis PING failed',
        details: {
          connectionStatus: redis.status,
          pingResult,
        },
      };
    }

    return {
      status: HealthStatus.HEALTHY,
      details: {
        connectionStatus: redis.status,
      },
    };
  } catch (error) {
    logger.error({ error }, 'Redis health check error');
    return {
      status: HealthStatus.UNHEALTHY,
      message: error instanceof Error ? error.message : 'Unknown error',
      details: {
        connectionStatus: 'error',
      },
    };
  }
}

/**
 * Check encryption key availability and validity
 */
export async function checkEncryptionHealth(): Promise<ComponentHealth> {
  try {
    // Check that encryption key is configured
    if (!config.github.tokenEncryptionKey) {
      logger.error('GitHub token encryption key is not configured');
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Encryption key not configured',
      };
    }

    // Verify encryption key meets minimum length requirement
    if (config.github.tokenEncryptionKey.length < MIN_ENCRYPTION_KEY_LENGTH) {
      logger.error('GitHub token encryption key is too short');
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Encryption key too short',
      };
    }

    // Verify JWT keys are present
    if (!config.jwt.privateKey || !config.jwt.publicKey) {
      logger.error('JWT keys are not configured');
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'JWT keys not configured',
      };
    }

    return {
      status: HealthStatus.HEALTHY,
      details: {
        githubTokenEncryptionKeyLength: config.github.tokenEncryptionKey.length,
        jwtKeysConfigured: true,
      },
    };
  } catch (error) {
    logger.error({ error }, 'Encryption health check error');
    return {
      status: HealthStatus.UNHEALTHY,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Prometheus metrics system health
 * Verifies registry initialization and ability to collect/export metrics
 */
export async function checkMetricsHealth(): Promise<ComponentHealth> {
  try {
    // If metrics are disabled, this is an expected state
    if (!config.metrics.enabled) {
      logger.debug('Metrics are disabled via configuration');
      return {
        status: HealthStatus.HEALTHY,
        message: 'Metrics disabled',
        details: {
          enabled: false,
        },
      };
    }

    // Check if metrics are initialized and registry exists
    const registry = getRegistry();
    if (!registry || !areMetricsEnabled()) {
      logger.error('Metrics registry not initialized despite being enabled');
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Metrics registry not initialized',
        details: {
          enabled: config.metrics.enabled,
          registryInitialized: false,
        },
      };
    }

    // Test ability to collect metrics by getting current metrics output
    try {
      const metricsOutput = await registry.metrics();
      
      // Verify we got some output (should at least have default metrics if enabled)
      if (!metricsOutput || metricsOutput.length === 0) {
        logger.warn('Metrics registry returned empty output');
        return {
          status: HealthStatus.DEGRADED,
          message: 'Metrics registry returned no data',
          details: {
            enabled: true,
            registryInitialized: true,
            metricsOutputEmpty: true,
          },
        };
      }

      logger.debug({ metricsSize: metricsOutput.length }, 'Metrics health check successful');
      return {
        status: HealthStatus.HEALTHY,
        details: {
          enabled: true,
          registryInitialized: true,
          metricsSize: metricsOutput.length,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve metrics from registry');
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'Failed to retrieve metrics',
        details: {
          enabled: true,
          registryInitialized: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  } catch (error) {
    logger.error({ error }, 'Metrics health check error');
    return {
      status: HealthStatus.UNHEALTHY,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check GitHub App token minting capability
 * Uses caching to avoid hammering GitHub API
 * 
 * NOTE: This check validates that the GitHub App private key is properly formatted
 * and can be used to sign JWTs. It does NOT make actual GitHub API calls to avoid
 * rate limiting and performance impact. The key validation ensures the service can
 * mint installation access tokens when needed. Full GitHub API connectivity should
 * be monitored separately through OAuth flow metrics.
 */
export async function checkGithubAppHealth(): Promise<ComponentHealth> {
  try {
    // Check cache first
    const now = Date.now();
    if (githubAppCheckCache && (now - githubAppCheckCache.timestamp) < GITHUB_APP_CACHE_TTL_MS) {
      logger.debug('Using cached GitHub App health check result');
      return {
        status: githubAppCheckCache.status,
        message: githubAppCheckCache.message,
        details: {
          cached: true,
          cacheAge: now - githubAppCheckCache.timestamp,
        },
      };
    }

    // Verify required configuration
    if (!config.github.appId || !config.github.privateKey || !config.github.installationId) {
      logger.error('GitHub App configuration is incomplete');
      const result: ComponentHealth = {
        status: HealthStatus.UNHEALTHY,
        message: 'GitHub App configuration incomplete',
      };
      
      githubAppCheckCache = {
        status: result.status,
        timestamp: now,
        message: result.message,
      };
      
      return result;
    }

    // Test JWT signing capability (validates private key)
    try {
      const testPayload = {
        iat: Math.floor(Date.now() / 1000) - JWT_TEST_CLOCK_OFFSET_SECONDS,
        exp: Math.floor(Date.now() / 1000) + JWT_TEST_CLOCK_OFFSET_SECONDS,
        iss: config.github.appId,
      };
      
      jwt.sign(testPayload, config.github.privateKey, { algorithm: 'RS256' });
    } catch (error) {
      logger.error({ error }, 'Failed to sign test JWT with GitHub App private key');
      const result: ComponentHealth = {
        status: HealthStatus.UNHEALTHY,
        message: 'GitHub App private key invalid',
      };
      
      githubAppCheckCache = {
        status: result.status,
        timestamp: now,
        message: result.message,
      };
      
      return result;
    }

    // All checks passed
    const result: ComponentHealth = {
      status: HealthStatus.HEALTHY,
      details: {
        appIdConfigured: true,
        privateKeyConfigured: true,
        installationIdConfigured: true,
      },
    };
    
    githubAppCheckCache = {
      status: result.status,
      timestamp: now,
    };
    
    return result;
  } catch (error) {
    logger.error({ error }, 'GitHub App health check error');
    const result: ComponentHealth = {
      status: HealthStatus.UNHEALTHY,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    
    githubAppCheckCache = {
      status: result.status,
      timestamp: Date.now(),
      message: result.message,
    };
    
    return result;
  }
}

/**
 * Perform comprehensive health check of all components
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  logger.debug('Starting comprehensive health check');

  // Run all health checks in parallel for efficiency
  const [databaseHealth, redisHealth, encryptionHealth, githubAppHealth, metricsHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
    checkEncryptionHealth(),
    checkGithubAppHealth(),
    checkMetricsHealth(),
  ]);

  // Determine overall status based on component health
  const componentHealths = [databaseHealth, redisHealth, encryptionHealth, githubAppHealth, metricsHealth];
  const criticalHealths = [databaseHealth, redisHealth, encryptionHealth];

  let overallStatus = HealthStatus.HEALTHY;
  
  // If any critical component is unhealthy, the service is unhealthy
  if (criticalHealths.some(h => h.status === HealthStatus.UNHEALTHY)) {
    overallStatus = HealthStatus.UNHEALTHY;
  }
  // Otherwise, if any component is degraded or the non-critical components (GitHub App, Metrics) are unhealthy, the service is degraded
  // GitHub App is not critical because the service can handle existing authenticated users and issue JWTs
  // even if GitHub App is down. Only new OAuth flows will fail.
  // Metrics are not critical because the service can operate without observability, though it's not ideal for production.
  else if (componentHealths.some(h => h.status === HealthStatus.DEGRADED || h.status === HealthStatus.UNHEALTHY)) {
    overallStatus = HealthStatus.DEGRADED;
  }

  const duration = Date.now() - startTime;
  logger.info(
    {
      overallStatus,
      duration,
      components: {
        database: databaseHealth.status,
        redis: redisHealth.status,
        encryption: encryptionHealth.status,
        githubApp: githubAppHealth.status,
        metrics: metricsHealth.status,
      },
    },
    'Health check completed'
  );

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    components: {
      database: databaseHealth,
      redis: redisHealth,
      encryption: encryptionHealth,
      githubApp: githubAppHealth,
      metrics: metricsHealth,
    },
  };
}

/**
 * Perform readiness check (for Cloud Run readiness probes)
 * Service is ready when critical components are healthy
 * 
 * NOTE: Metrics readiness is included when metrics are enabled. If metrics are disabled,
 * this is logged as a warning but does not fail readiness. This allows deployments
 * without metrics while ensuring observability in production environments.
 */
export async function performReadinessCheck(): Promise<{
  ready: boolean;
  reason?: string;
  components: Record<string, HealthStatus>;
}> {
  const [databaseHealth, redisHealth, encryptionHealth, metricsHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
    checkEncryptionHealth(),
    checkMetricsHealth(),
  ]);

  // Determine readiness based on critical components
  // Metrics are critical only if enabled; if disabled, we skip the check
  const criticalHealths = [databaseHealth, redisHealth, encryptionHealth];
  
  // Add metrics to critical checks only if enabled
  if (config.metrics.enabled) {
    criticalHealths.push(metricsHealth);
  } else {
    // Log warning if metrics are disabled to ensure visibility
    logger.warn('Metrics are disabled - deployment will proceed without observability checks');
  }

  const ready = criticalHealths.every(h => h.status === HealthStatus.HEALTHY);

  let reason: string | undefined;
  if (!ready) {
    const unhealthyComponents = [];
    if (databaseHealth.status !== HealthStatus.HEALTHY) unhealthyComponents.push('database');
    if (redisHealth.status !== HealthStatus.HEALTHY) unhealthyComponents.push('redis');
    if (encryptionHealth.status !== HealthStatus.HEALTHY) unhealthyComponents.push('encryption');
    if (config.metrics.enabled && metricsHealth.status !== HealthStatus.HEALTHY) {
      unhealthyComponents.push('metrics');
    }
    
    reason = `Unhealthy components: ${unhealthyComponents.join(', ')}`;
    
    logger.warn(
      {
        reason,
        components: {
          database: databaseHealth.status,
          redis: redisHealth.status,
          encryption: encryptionHealth.status,
          metrics: metricsHealth.status,
        },
      },
      'Readiness check failed'
    );
  }

  return {
    ready,
    reason,
    components: {
      database: databaseHealth.status,
      redis: redisHealth.status,
      encryption: encryptionHealth.status,
      metrics: metricsHealth.status,
    },
  };
}

/**
 * Clear the GitHub App health check cache
 * Useful for testing or forcing a fresh check
 */
export function clearGithubAppCache(): void {
  githubAppCheckCache = null;
  logger.debug('Cleared GitHub App health check cache');
}
