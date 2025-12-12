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
import {
  checkDatabaseHealth,
  checkRedisHealth,
  checkEncryptionHealth,
  checkGithubAppHealth,
  checkMetricsHealth,
  performHealthCheck,
  performReadinessCheck,
  clearGithubAppCache,
  HealthStatus,
} from './health-check';
import db from '../db';
import * as redisClient from './redis-client';
import * as metricsService from './metrics';
import { config } from '../config';
import logger from '../utils/logger';

// Mock dependencies
jest.mock('../db');
jest.mock('./redis-client');
jest.mock('./metrics');
jest.mock('../utils/logger');

describe('Health Check Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGithubAppCache();
  });

  describe('checkDatabaseHealth', () => {
    it('should return healthy status when database is connected', async () => {
      (db.healthCheck as jest.Mock).mockResolvedValue(true);
      Object.defineProperty(db, 'connected', { value: true, configurable: true });

      const result = await checkDatabaseHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details).toMatchObject({
        connected: true,
        sslEnabled: expect.any(Boolean),
      });
    });

    it('should return unhealthy status when database is not responding', async () => {
      (db.healthCheck as jest.Mock).mockResolvedValue(false);
      Object.defineProperty(db, 'connected', { value: false, configurable: true });

      const result = await checkDatabaseHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Database is not responding');
    });

    it('should return degraded status when SSL is disabled in production', async () => {
      (db.healthCheck as jest.Mock).mockResolvedValue(true);
      Object.defineProperty(db, 'connected', { value: true, configurable: true });
      
      const originalEnv = config.env;
      const originalSsl = config.database.ssl.enabled;
      
      (config as any).env = 'production';
      (config.database.ssl as any).enabled = false;

      const result = await checkDatabaseHealth();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.message).toBe('Database SSL is not enabled');

      // Restore
      (config as any).env = originalEnv;
      (config.database.ssl as any).enabled = originalSsl;
    });

    it('should handle errors gracefully', async () => {
      (db.healthCheck as jest.Mock).mockRejectedValue(new Error('Connection error'));

      const result = await checkDatabaseHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Connection error');
    });
  });

  describe('checkRedisHealth', () => {
    it('should return healthy status when Redis is connected', async () => {
      const mockRedis = {
        status: 'ready',
        ping: jest.fn().mockResolvedValue('PONG'),
      };
      
      (redisClient.getRedisClient as jest.Mock).mockReturnValue(mockRedis);
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(true);

      const result = await checkRedisHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details?.connectionStatus).toBe('ready');
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should return unhealthy status when Redis is not connected', async () => {
      const mockRedis = {
        status: 'disconnected',
      };
      
      (redisClient.getRedisClient as jest.Mock).mockReturnValue(mockRedis);
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(false);

      const result = await checkRedisHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Redis is not connected');
    });

    it('should return unhealthy status when PING fails', async () => {
      const mockRedis = {
        status: 'ready',
        ping: jest.fn().mockResolvedValue('ERROR'),
      };
      
      (redisClient.getRedisClient as jest.Mock).mockReturnValue(mockRedis);
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(true);

      const result = await checkRedisHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Redis PING failed');
    });

    it('should handle errors gracefully', async () => {
      const mockRedis = {
        status: 'ready',
        ping: jest.fn().mockRejectedValue(new Error('PING failed')),
      };
      
      (redisClient.getRedisClient as jest.Mock).mockReturnValue(mockRedis);
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(true);

      const result = await checkRedisHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('PING failed');
    });
  });

  describe('checkEncryptionHealth', () => {
    it('should return healthy status when all keys are configured', async () => {
      const result = await checkEncryptionHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details?.jwtKeysConfigured).toBe(true);
    });

    it('should return unhealthy status when encryption key is missing', async () => {
      const originalKey = config.github.tokenEncryptionKey;
      (config.github as any).tokenEncryptionKey = '';

      const result = await checkEncryptionHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Encryption key not configured');

      // Restore
      (config.github as any).tokenEncryptionKey = originalKey;
    });

    it('should return unhealthy status when encryption key is too short', async () => {
      const originalKey = config.github.tokenEncryptionKey;
      (config.github as any).tokenEncryptionKey = 'short';

      const result = await checkEncryptionHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Encryption key too short');

      // Restore
      (config.github as any).tokenEncryptionKey = originalKey;
    });

    it('should return unhealthy status when JWT keys are missing', async () => {
      const originalPrivateKey = config.jwt.privateKey;
      (config.jwt as any).privateKey = '';

      const result = await checkEncryptionHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('JWT keys not configured');

      // Restore
      (config.jwt as any).privateKey = originalPrivateKey;
    });
  });

  describe('checkMetricsHealth', () => {
    it('should return healthy status when metrics are enabled and working', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = true;
      
      const mockRegistry = {
        metrics: jest.fn().mockResolvedValue('# HELP metric_name description\nmetric_name 1'),
      };
      
      (metricsService.areMetricsEnabled as jest.Mock).mockReturnValue(true);
      (metricsService.getRegistry as jest.Mock).mockReturnValue(mockRegistry);

      const result = await checkMetricsHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details?.enabled).toBe(true);
      expect(result.details?.registryInitialized).toBe(true);
      expect(mockRegistry.metrics).toHaveBeenCalled();

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should return healthy status when metrics are disabled', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = false;

      const result = await checkMetricsHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.message).toBe('Metrics disabled');
      expect(result.details?.enabled).toBe(false);

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should return unhealthy status when registry is not initialized', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = true;
      
      (metricsService.areMetricsEnabled as jest.Mock).mockReturnValue(false);
      (metricsService.getRegistry as jest.Mock).mockReturnValue(null);

      const result = await checkMetricsHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Metrics registry not initialized');
      expect(result.details?.registryInitialized).toBe(false);

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should return unhealthy status when metrics output is empty', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = true;
      
      const mockRegistry = {
        metrics: jest.fn().mockResolvedValue(''),
      };
      
      (metricsService.areMetricsEnabled as jest.Mock).mockReturnValue(true);
      (metricsService.getRegistry as jest.Mock).mockReturnValue(mockRegistry);

      const result = await checkMetricsHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Metrics collection failed - no data available');
      expect(result.details?.metricsOutputEmpty).toBe(true);

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should return unhealthy status when metrics retrieval fails', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = true;
      
      const mockRegistry = {
        metrics: jest.fn().mockRejectedValue(new Error('Metrics collection failed')),
      };
      
      (metricsService.areMetricsEnabled as jest.Mock).mockReturnValue(true);
      (metricsService.getRegistry as jest.Mock).mockReturnValue(mockRegistry);

      const result = await checkMetricsHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Failed to retrieve metrics');
      expect(result.details?.error).toBe('Metrics collection failed');

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should handle errors gracefully', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = true;
      
      (metricsService.areMetricsEnabled as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await checkMetricsHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('Unexpected error');

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });
  });

  describe('checkGithubAppHealth', () => {
    it('should return healthy status when GitHub App is properly configured', async () => {
      const result = await checkGithubAppHealth();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details?.appIdConfigured).toBe(true);
      expect(result.details?.privateKeyConfigured).toBe(true);
      expect(result.details?.installationIdConfigured).toBe(true);
    });

    it('should cache successful results', async () => {
      const result1 = await checkGithubAppHealth();
      const result2 = await checkGithubAppHealth();

      expect(result1.status).toBe(HealthStatus.HEALTHY);
      expect(result2.status).toBe(HealthStatus.HEALTHY);
      expect(result2.details?.cached).toBe(true);
      expect(result2.details?.cacheAge).toBeLessThan(1000); // Less than 1 second
    });

    it('should return unhealthy status when GitHub App config is incomplete', async () => {
      const originalAppId = config.github.appId;
      (config.github as any).appId = '';

      const result = await checkGithubAppHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('GitHub App configuration incomplete');

      // Restore
      (config.github as any).appId = originalAppId;
      clearGithubAppCache();
    });

    it('should return unhealthy status when private key is invalid', async () => {
      const originalKey = config.github.privateKey;
      (config.github as any).privateKey = 'invalid-key';

      const result = await checkGithubAppHealth();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toBe('GitHub App private key invalid');

      // Restore
      (config.github as any).privateKey = originalKey;
      clearGithubAppCache();
    });

    it('should cache error results to avoid API hammering', async () => {
      const originalAppId = config.github.appId;
      (config.github as any).appId = '';

      const result1 = await checkGithubAppHealth();
      const result2 = await checkGithubAppHealth();

      expect(result1.status).toBe(HealthStatus.UNHEALTHY);
      expect(result2.status).toBe(HealthStatus.UNHEALTHY);
      expect(result2.details?.cached).toBe(true);

      // Restore
      (config.github as any).appId = originalAppId;
      clearGithubAppCache();
    });
  });

  describe('performHealthCheck', () => {
    beforeEach(() => {
      // Setup default healthy mocks
      (db.healthCheck as jest.Mock).mockResolvedValue(true);
      Object.defineProperty(db, 'connected', { value: true, configurable: true });
      
      const mockRedis = {
        status: 'ready',
        ping: jest.fn().mockResolvedValue('PONG'),
      };
      (redisClient.getRedisClient as jest.Mock).mockReturnValue(mockRedis);
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(true);

      // Setup default healthy metrics mocks
      const mockRegistry = {
        metrics: jest.fn().mockResolvedValue('# HELP metric_name description\nmetric_name 1'),
      };
      (metricsService.areMetricsEnabled as jest.Mock).mockReturnValue(true);
      (metricsService.getRegistry as jest.Mock).mockReturnValue(mockRegistry);
      (config.metrics as any).enabled = true;
    });

    it('should return overall healthy status when all components are healthy', async () => {
      const result = await performHealthCheck();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.components.database.status).toBe(HealthStatus.HEALTHY);
      expect(result.components.redis.status).toBe(HealthStatus.HEALTHY);
      expect(result.components.encryption.status).toBe(HealthStatus.HEALTHY);
      expect(result.components.githubApp.status).toBe(HealthStatus.HEALTHY);
      expect(result.components.metrics?.status).toBe(HealthStatus.HEALTHY);
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('environment');
    });

    it('should return unhealthy status when database is unhealthy', async () => {
      (db.healthCheck as jest.Mock).mockResolvedValue(false);

      const result = await performHealthCheck();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.components.database.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return unhealthy status when Redis is unhealthy', async () => {
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(false);

      const result = await performHealthCheck();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.components.redis.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return unhealthy status when encryption is unhealthy', async () => {
      const originalKey = config.github.tokenEncryptionKey;
      (config.github as any).tokenEncryptionKey = '';

      const result = await performHealthCheck();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.components.encryption.status).toBe(HealthStatus.UNHEALTHY);

      // Restore
      (config.github as any).tokenEncryptionKey = originalKey;
    });

    it('should return degraded status when only GitHub App is unhealthy', async () => {
      const originalAppId = config.github.appId;
      (config.github as any).appId = '';
      clearGithubAppCache();

      const result = await performHealthCheck();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.components.githubApp.status).toBe(HealthStatus.UNHEALTHY);

      // Restore
      (config.github as any).appId = originalAppId;
      clearGithubAppCache();
    });

    it('should return degraded status when only metrics are unhealthy', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = true;
      
      (metricsService.areMetricsEnabled as jest.Mock).mockReturnValue(false);
      (metricsService.getRegistry as jest.Mock).mockReturnValue(null);

      const result = await performHealthCheck();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.components.metrics?.status).toBe(HealthStatus.UNHEALTHY);

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should return healthy status when metrics are disabled', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = false;

      const result = await performHealthCheck();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.components.metrics?.status).toBe(HealthStatus.HEALTHY);
      expect(result.components.metrics?.message).toBe('Metrics disabled');

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should return degraded status when database has degraded status', async () => {
      const originalEnv = config.env;
      const originalSsl = config.database.ssl.enabled;
      
      (config as any).env = 'production';
      (config.database.ssl as any).enabled = false;

      const result = await performHealthCheck();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.components.database.status).toBe(HealthStatus.DEGRADED);

      // Restore
      (config as any).env = originalEnv;
      (config.database.ssl as any).enabled = originalSsl;
    });
  });

  describe('performReadinessCheck', () => {
    beforeEach(() => {
      // Setup default healthy mocks
      (db.healthCheck as jest.Mock).mockResolvedValue(true);
      Object.defineProperty(db, 'connected', { value: true, configurable: true });
      
      const mockRedis = {
        status: 'ready',
        ping: jest.fn().mockResolvedValue('PONG'),
      };
      (redisClient.getRedisClient as jest.Mock).mockReturnValue(mockRedis);
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(true);

      // Setup default healthy metrics mocks
      const mockRegistry = {
        metrics: jest.fn().mockResolvedValue('# HELP metric_name description\nmetric_name 1'),
      };
      (metricsService.areMetricsEnabled as jest.Mock).mockReturnValue(true);
      (metricsService.getRegistry as jest.Mock).mockReturnValue(mockRegistry);
      (config.metrics as any).enabled = true;
    });

    it('should return ready when all critical components are healthy', async () => {
      const result = await performReadinessCheck();

      expect(result.ready).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.components.database).toBe(HealthStatus.HEALTHY);
      expect(result.components.redis).toBe(HealthStatus.HEALTHY);
      expect(result.components.encryption).toBe(HealthStatus.HEALTHY);
      expect(result.components.metrics).toBe(HealthStatus.HEALTHY);
    });

    it('should return not ready when database is unhealthy', async () => {
      (db.healthCheck as jest.Mock).mockResolvedValue(false);

      const result = await performReadinessCheck();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('database');
    });

    it('should return not ready when Redis is unhealthy', async () => {
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(false);

      const result = await performReadinessCheck();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('redis');
    });

    it('should return not ready when encryption is unhealthy', async () => {
      const originalKey = config.github.tokenEncryptionKey;
      (config.github as any).tokenEncryptionKey = '';

      const result = await performReadinessCheck();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('encryption');

      // Restore
      (config.github as any).tokenEncryptionKey = originalKey;
    });

    it('should return not ready when multiple components are unhealthy', async () => {
      (db.healthCheck as jest.Mock).mockResolvedValue(false);
      (redisClient.isRedisConnected as jest.Mock).mockReturnValue(false);

      const result = await performReadinessCheck();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('database');
      expect(result.reason).toContain('redis');
    });

    it('should return not ready when metrics are unhealthy and enabled', async () => {
      (metricsService.areMetricsEnabled as jest.Mock).mockReturnValue(false);
      (metricsService.getRegistry as jest.Mock).mockReturnValue(null);

      const result = await performReadinessCheck();

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('metrics');
      expect(result.components.metrics).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return ready when metrics are disabled', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = false;

      const result = await performReadinessCheck();

      expect(result.ready).toBe(true);
      expect(result.components.metrics).toBe(HealthStatus.HEALTHY);
      expect(result.components.metrics).toBeDefined();

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should log warning when metrics are disabled', async () => {
      const originalEnabled = config.metrics.enabled;
      (config.metrics as any).enabled = false;

      await performReadinessCheck();

      // Verify the warning message is logged
      expect(logger.warn).toHaveBeenCalledWith(
        'Metrics disabled - readiness passes but observability unavailable. Set METRICS_ENABLED=true for production.'
      );

      // Restore
      (config.metrics as any).enabled = originalEnabled;
    });

    it('should not check GitHub App status for readiness', async () => {
      // Even if GitHub App is unhealthy, readiness should pass
      const originalAppId = config.github.appId;
      (config.github as any).appId = '';
      clearGithubAppCache();

      const result = await performReadinessCheck();

      expect(result.ready).toBe(true);
      expect(result.components).not.toHaveProperty('githubApp');

      // Restore
      (config.github as any).appId = originalAppId;
      clearGithubAppCache();
    });
  });

  describe('clearGithubAppCache', () => {
    it('should clear the cache and force fresh check', async () => {
      // First check
      const result1 = await checkGithubAppHealth();
      expect(result1.details?.cached).toBeUndefined();

      // Second check (should be cached)
      const result2 = await checkGithubAppHealth();
      expect(result2.details?.cached).toBe(true);

      // Clear cache
      clearGithubAppCache();

      // Third check (should not be cached)
      const result3 = await checkGithubAppHealth();
      expect(result3.details?.cached).toBeUndefined();
    });
  });
});
