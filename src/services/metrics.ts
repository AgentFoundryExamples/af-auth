import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Prometheus metrics service for monitoring authentication flows and operations.
 * 
 * This service provides centralized metrics collection for:
 * - GitHub OAuth exchanges
 * - JWT issuances and validations
 * - Token revocation checks
 * - Rate limiting enforcement
 * - Failed/suspicious authentication attempts
 * - Request durations
 * - System health (Redis connectivity, backlogs)
 */

// Global registry instance
let registry: Registry | null = null;

// Metrics collectors
let githubOAuthCounter: Counter | null = null;
let jwtOperationsCounter: Counter | null = null;
let tokenRevocationCounter: Counter | null = null;
let rateLimitCounter: Counter | null = null;
let authFailureCounter: Counter | null = null;
let requestDurationHistogram: Histogram | null = null;
let redisConnectionGauge: Gauge | null = null;

/**
 * Initialize Prometheus metrics registry and collectors.
 * 
 * IMPORTANT: Must be called once at application startup, before the server starts
 * accepting requests. This function is not thread-safe and should not be called
 * concurrently from multiple threads/workers. The singleton pattern prevents
 * re-initialization but does not provide locking for concurrent calls.
 */
export function initializeMetrics(): void {
  // Check if metrics are disabled
  if (!config.metrics.enabled) {
    logger.info('Prometheus metrics disabled via configuration');
    return;
  }

  // Prevent re-initialization
  // Note: This check is not atomic. Ensure this function is called synchronously
  // at startup before any concurrent request processing begins.
  if (registry !== null) {
    logger.warn('Metrics registry already initialized, skipping re-initialization');
    return;
  }

  try {
    logger.info('Initializing Prometheus metrics...');

    // Create new registry
    registry = new Registry();

    // Set default labels for all metrics
    if (config.metrics.namespace) {
      registry.setDefaultLabels({
        app: config.metrics.namespace,
        environment: config.env,
      });
    }

    // Collect default metrics (CPU, memory, etc.) if enabled
    if (config.metrics.collectDefaultMetrics) {
      collectDefaultMetrics({
        register: registry,
        prefix: config.metrics.prefix,
      });
      logger.debug('Default metrics collection enabled');
    }

    // Initialize GitHub OAuth metrics
    githubOAuthCounter = new Counter({
      name: `${config.metrics.prefix}github_oauth_operations_total`,
      help: 'Total number of GitHub OAuth operations',
      labelNames: ['operation', 'status'],
      registers: [registry],
    });

    // Initialize JWT operation metrics
    jwtOperationsCounter = new Counter({
      name: `${config.metrics.prefix}jwt_operations_total`,
      help: 'Total number of JWT operations (issue, validate, revoke)',
      labelNames: ['operation', 'status'],
      registers: [registry],
    });

    // Initialize token revocation metrics
    tokenRevocationCounter = new Counter({
      name: `${config.metrics.prefix}token_revocation_checks_total`,
      help: 'Total number of token revocation checks',
      labelNames: ['status', 'result'],
      registers: [registry],
    });

    // Initialize rate limiting metrics
    rateLimitCounter = new Counter({
      name: `${config.metrics.prefix}rate_limit_hits_total`,
      help: 'Total number of rate limit hits',
      labelNames: ['endpoint', 'action'],
      registers: [registry],
    });

    // Initialize authentication failure metrics
    authFailureCounter = new Counter({
      name: `${config.metrics.prefix}auth_failures_total`,
      help: 'Total number of authentication failures and suspicious attempts',
      labelNames: ['type', 'reason'],
      registers: [registry],
    });

    // Initialize request duration histogram
    requestDurationHistogram = new Histogram({
      name: `${config.metrics.prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    });

    // Initialize Redis connection gauge
    redisConnectionGauge = new Gauge({
      name: `${config.metrics.prefix}redis_connection_status`,
      help: 'Redis connection status (1 = connected, 0 = disconnected)',
      registers: [registry],
    });

    logger.info(
      {
        prefix: config.metrics.prefix,
        namespace: config.metrics.namespace,
        defaultMetrics: config.metrics.collectDefaultMetrics,
      },
      'Prometheus metrics initialized successfully'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Prometheus metrics');
    // Set registry to null to indicate initialization failure
    registry = null;
    throw error;
  }
}

/**
 * Get the metrics registry.
 * Returns null if metrics are disabled or not initialized.
 */
export function getRegistry(): Registry | null {
  return registry;
}

/**
 * Check if metrics are enabled and initialized.
 */
export function areMetricsEnabled(): boolean {
  return registry !== null && config.metrics.enabled;
}

/**
 * Record a GitHub OAuth operation.
 * @param operation - The type of operation (authorize, token_exchange, token_refresh, user_fetch)
 * @param status - The status of the operation (success, failure)
 */
export function recordGitHubOAuthOperation(operation: string, status: 'success' | 'failure'): void {
  if (!areMetricsEnabled() || !githubOAuthCounter) {
    return;
  }
  try {
    githubOAuthCounter.inc({ operation, status });
  } catch (error) {
    logger.error({ error, operation, status }, 'Failed to record GitHub OAuth metric');
  }
}

/**
 * Record a JWT operation.
 * @param operation - The type of operation (issue, validate, refresh, revoke)
 * @param status - The status of the operation (success, failure)
 */
export function recordJWTOperation(operation: string, status: 'success' | 'failure'): void {
  if (!areMetricsEnabled() || !jwtOperationsCounter) {
    return;
  }
  try {
    jwtOperationsCounter.inc({ operation, status });
  } catch (error) {
    logger.error({ error, operation, status }, 'Failed to record JWT operation metric');
  }
}

/**
 * Record a token revocation check.
 * @param status - The status of the check (success, failure)
 * @param result - The result of the check (revoked, valid, error)
 */
export function recordTokenRevocationCheck(
  status: 'success' | 'failure',
  result: 'revoked' | 'valid' | 'error'
): void {
  if (!areMetricsEnabled() || !tokenRevocationCounter) {
    return;
  }
  try {
    tokenRevocationCounter.inc({ status, result });
  } catch (error) {
    logger.error({ error, status, result }, 'Failed to record token revocation metric');
  }
}

/**
 * Record a rate limit hit.
 * @param endpoint - The endpoint that was rate limited
 * @param action - The action taken (allowed, blocked)
 */
export function recordRateLimitHit(endpoint: string, action: 'allowed' | 'blocked'): void {
  if (!areMetricsEnabled() || !rateLimitCounter) {
    return;
  }
  try {
    rateLimitCounter.inc({ endpoint, action });
  } catch (error) {
    logger.error({ error, endpoint, action }, 'Failed to record rate limit metric');
  }
}

/**
 * Record an authentication failure.
 * @param type - The type of failure (oauth, jwt, whitelist, suspicious)
 * @param reason - The reason for the failure
 */
export function recordAuthFailure(type: string, reason: string): void {
  if (!areMetricsEnabled() || !authFailureCounter) {
    return;
  }
  try {
    authFailureCounter.inc({ type, reason });
  } catch (error) {
    logger.error({ error, type, reason }, 'Failed to record auth failure metric');
  }
}

/**
 * Record HTTP request duration.
 * @param method - The HTTP method
 * @param route - The route pattern
 * @param statusCode - The HTTP status code
 * @param durationSeconds - The duration in seconds
 */
export function recordRequestDuration(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
): void {
  if (!areMetricsEnabled() || !requestDurationHistogram) {
    return;
  }
  try {
    requestDurationHistogram.observe({ method, route, status_code: statusCode }, durationSeconds);
  } catch (error) {
    logger.error({ error, method, route, statusCode }, 'Failed to record request duration metric');
  }
}

/**
 * Update Redis connection status.
 * @param connected - Whether Redis is connected (1) or disconnected (0)
 */
export function updateRedisConnectionStatus(connected: boolean): void {
  if (!areMetricsEnabled() || !redisConnectionGauge) {
    return;
  }
  try {
    redisConnectionGauge.set(connected ? 1 : 0);
  } catch (error) {
    logger.error({ error, connected }, 'Failed to update Redis connection status metric');
  }
}

/**
 * Get metrics in Prometheus text format.
 * Returns null if metrics are disabled.
 */
export async function getMetrics(): Promise<string | null> {
  if (!areMetricsEnabled() || !registry) {
    return null;
  }
  try {
    return await registry.metrics();
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve metrics');
    throw error;
  }
}

/**
 * Reset all metrics. Used for testing.
 */
export function resetMetrics(): void {
  if (registry) {
    registry.clear();
  }
  registry = null;
  githubOAuthCounter = null;
  jwtOperationsCounter = null;
  tokenRevocationCounter = null;
  rateLimitCounter = null;
  authFailureCounter = null;
  requestDurationHistogram = null;
  redisConnectionGauge = null;
  logger.debug('Metrics reset');
}
