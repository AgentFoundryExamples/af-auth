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
// Mock logger before any imports
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config before importing metrics
jest.mock('../config', () => ({
  config: {
    env: 'test',
    metrics: {
      enabled: true,
      prefix: 'test_',
      namespace: 'test_app',
      collectDefaultMetrics: false,
      endpoint: '/metrics',
      authToken: null,
    },
  },
}));

import {
  initializeMetrics,
  getRegistry,
  areMetricsEnabled,
  recordGitHubOAuthOperation,
  recordJWTOperation,
  recordTokenRevocationCheck,
  recordRateLimitHit,
  recordAuthFailure,
  recordRequestDuration,
  updateRedisConnectionStatus,
  getMetrics,
  resetMetrics,
} from './metrics';
import { config } from '../config';

describe('Metrics Service', () => {
  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    resetMetrics();
  });

  describe('initializeMetrics', () => {
    it('should initialize metrics registry when enabled', () => {
      initializeMetrics();
      
      const registry = getRegistry();
      expect(registry).not.toBeNull();
      expect(areMetricsEnabled()).toBe(true);
    });

    it('should not initialize metrics when disabled', () => {
      // Temporarily disable metrics
      (config.metrics as any).enabled = false;
      
      initializeMetrics();
      
      expect(getRegistry()).toBeNull();
      expect(areMetricsEnabled()).toBe(false);
      
      // Restore
      (config.metrics as any).enabled = true;
    });

    it('should not re-initialize if already initialized', () => {
      initializeMetrics();
      const registry1 = getRegistry();
      
      initializeMetrics();
      const registry2 = getRegistry();
      
      expect(registry1).toBe(registry2);
    });

    it('should set default labels', () => {
      initializeMetrics();
      
      const registry = getRegistry();
      expect(registry).not.toBeNull();
    });
  });

  describe('recordGitHubOAuthOperation', () => {
    beforeEach(() => {
      initializeMetrics();
    });

    it('should record successful token exchange', async () => {
      recordGitHubOAuthOperation('token_exchange', 'success');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_github_oauth_operations_total');
      expect(metrics).toContain('operation="token_exchange"');
      expect(metrics).toContain('status="success"');
    });

    it('should record failed OAuth operation', async () => {
      recordGitHubOAuthOperation('authorize', 'failure');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_github_oauth_operations_total');
      expect(metrics).toContain('operation="authorize"');
      expect(metrics).toContain('status="failure"');
    });

    it('should handle multiple operations', async () => {
      recordGitHubOAuthOperation('token_exchange', 'success');
      recordGitHubOAuthOperation('token_refresh', 'success');
      recordGitHubOAuthOperation('user_fetch', 'failure');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('operation="token_exchange"');
      expect(metrics).toContain('operation="token_refresh"');
      expect(metrics).toContain('operation="user_fetch"');
    });

    it('should not record when metrics disabled', async () => {
      resetMetrics();
      
      recordGitHubOAuthOperation('token_exchange', 'success');
      
      const metrics = await getMetrics();
      expect(metrics).toBeNull();
    });
  });

  describe('recordJWTOperation', () => {
    beforeEach(() => {
      initializeMetrics();
    });

    it('should record JWT issuance', async () => {
      recordJWTOperation('issue', 'success');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_jwt_operations_total');
      expect(metrics).toContain('operation="issue"');
      expect(metrics).toContain('status="success"');
    });

    it('should record JWT validation failure', async () => {
      recordJWTOperation('validate', 'failure');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('operation="validate"');
      expect(metrics).toContain('status="failure"');
    });

    it('should record JWT revocation', async () => {
      recordJWTOperation('revoke', 'success');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('operation="revoke"');
      expect(metrics).toContain('status="success"');
    });
  });

  describe('recordTokenRevocationCheck', () => {
    beforeEach(() => {
      initializeMetrics();
    });

    it('should record valid token check', async () => {
      recordTokenRevocationCheck('success', 'valid');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_token_revocation_checks_total');
      expect(metrics).toContain('status="success"');
      expect(metrics).toContain('result="valid"');
    });

    it('should record revoked token check', async () => {
      recordTokenRevocationCheck('success', 'revoked');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('result="revoked"');
    });

    it('should record failed revocation check', async () => {
      recordTokenRevocationCheck('failure', 'error');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('status="failure"');
      expect(metrics).toContain('result="error"');
    });
  });

  describe('recordRateLimitHit', () => {
    beforeEach(() => {
      initializeMetrics();
    });

    it('should record allowed request', async () => {
      recordRateLimitHit('auth', 'allowed');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_rate_limit_hits_total');
      expect(metrics).toContain('endpoint="auth"');
      expect(metrics).toContain('action="allowed"');
    });

    it('should record blocked request', async () => {
      recordRateLimitHit('jwt', 'blocked');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('endpoint="jwt"');
      expect(metrics).toContain('action="blocked"');
    });

    it('should track different endpoints', async () => {
      recordRateLimitHit('auth', 'allowed');
      recordRateLimitHit('jwt', 'allowed');
      recordRateLimitHit('github-token', 'blocked');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('endpoint="auth"');
      expect(metrics).toContain('endpoint="jwt"');
      expect(metrics).toContain('endpoint="github-token"');
    });
  });

  describe('recordAuthFailure', () => {
    beforeEach(() => {
      initializeMetrics();
    });

    it('should record OAuth failure', async () => {
      recordAuthFailure('oauth', 'invalid_state');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_auth_failures_total');
      expect(metrics).toContain('type="oauth"');
      expect(metrics).toContain('reason="invalid_state"');
    });

    it('should record JWT failure', async () => {
      recordAuthFailure('jwt', 'token_expired');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('type="jwt"');
      expect(metrics).toContain('reason="token_expired"');
    });

    it('should record whitelist failure', async () => {
      recordAuthFailure('whitelist', 'not_whitelisted');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('type="whitelist"');
      expect(metrics).toContain('reason="not_whitelisted"');
    });

    it('should record suspicious activity', async () => {
      recordAuthFailure('suspicious', 'multiple_failed_attempts');
      
      const metrics = await getMetrics();
      expect(metrics).toContain('type="suspicious"');
      expect(metrics).toContain('reason="multiple_failed_attempts"');
    });
  });

  describe('recordRequestDuration', () => {
    beforeEach(() => {
      initializeMetrics();
    });

    it('should record request duration', async () => {
      recordRequestDuration('GET', '/auth/github', 200, 0.123);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_http_request_duration_seconds');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('route="/auth/github"');
      expect(metrics).toContain('status_code="200"');
    });

    it('should record POST requests', async () => {
      recordRequestDuration('POST', '/api/jwt/issue', 201, 0.045);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('method="POST"');
      expect(metrics).toContain('route="/api/jwt/issue"');
      expect(metrics).toContain('status_code="201"');
    });

    it('should record error responses', async () => {
      recordRequestDuration('GET', '/api/jwt/validate', 401, 0.015);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('status_code="401"');
    });

    it('should handle different durations', async () => {
      recordRequestDuration('GET', '/health', 200, 0.001);
      recordRequestDuration('GET', '/api/github-token', 200, 1.5);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_http_request_duration_seconds');
    });
  });

  describe('updateRedisConnectionStatus', () => {
    beforeEach(() => {
      initializeMetrics();
    });

    it('should set connected status', async () => {
      updateRedisConnectionStatus(true);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_redis_connection_status');
      expect(metrics).toMatch(/test_redis_connection_status\{.*\} 1/);
    });

    it('should set disconnected status', async () => {
      updateRedisConnectionStatus(false);
      
      const metrics = await getMetrics();
      expect(metrics).toMatch(/test_redis_connection_status\{.*\} 0/);
    });

    it('should update status multiple times', async () => {
      updateRedisConnectionStatus(true);
      updateRedisConnectionStatus(false);
      updateRedisConnectionStatus(true);
      
      const metrics = await getMetrics();
      // Should show the latest value
      expect(metrics).toMatch(/test_redis_connection_status\{.*\} 1/);
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      initializeMetrics();
    });

    it('should return metrics in Prometheus format', async () => {
      recordGitHubOAuthOperation('token_exchange', 'success');
      recordJWTOperation('issue', 'success');
      
      const metrics = await getMetrics();
      
      expect(metrics).not.toBeNull();
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('should return null when metrics disabled', async () => {
      resetMetrics();
      
      const metrics = await getMetrics();
      expect(metrics).toBeNull();
    });

    it('should include all recorded metrics', async () => {
      recordGitHubOAuthOperation('token_exchange', 'success');
      recordJWTOperation('issue', 'success');
      recordTokenRevocationCheck('success', 'valid');
      recordRateLimitHit('auth', 'allowed');
      recordAuthFailure('oauth', 'invalid_state');
      recordRequestDuration('GET', '/health', 200, 0.01);
      updateRedisConnectionStatus(true);
      
      const metrics = await getMetrics();
      
      expect(metrics).toContain('test_github_oauth_operations_total');
      expect(metrics).toContain('test_jwt_operations_total');
      expect(metrics).toContain('test_token_revocation_checks_total');
      expect(metrics).toContain('test_rate_limit_hits_total');
      expect(metrics).toContain('test_auth_failures_total');
      expect(metrics).toContain('test_http_request_duration_seconds');
      expect(metrics).toContain('test_redis_connection_status');
    });
  });

  describe('resetMetrics', () => {
    it('should clear all metrics', async () => {
      initializeMetrics();
      recordGitHubOAuthOperation('token_exchange', 'success');
      
      let metrics = await getMetrics();
      expect(metrics).not.toBeNull();
      
      resetMetrics();
      
      expect(getRegistry()).toBeNull();
      expect(areMetricsEnabled()).toBe(false);
      
      metrics = await getMetrics();
      expect(metrics).toBeNull();
    });

    it('should allow re-initialization after reset', () => {
      initializeMetrics();
      expect(areMetricsEnabled()).toBe(true);
      
      resetMetrics();
      expect(areMetricsEnabled()).toBe(false);
      
      initializeMetrics();
      expect(areMetricsEnabled()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle recording when metrics not initialized', async () => {
      // Don't call initializeMetrics
      
      // These should not throw errors
      recordGitHubOAuthOperation('token_exchange', 'success');
      recordJWTOperation('issue', 'success');
      recordTokenRevocationCheck('success', 'valid');
      recordRateLimitHit('auth', 'allowed');
      recordAuthFailure('oauth', 'invalid_state');
      recordRequestDuration('GET', '/health', 200, 0.01);
      updateRedisConnectionStatus(true);
      
      const metrics = await getMetrics();
      expect(metrics).toBeNull();
    });

    it('should handle very large metric values', async () => {
      initializeMetrics();
      
      // Record many operations
      for (let i = 0; i < 1000; i++) {
        recordGitHubOAuthOperation('token_exchange', 'success');
      }
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_github_oauth_operations_total');
    });

    it('should handle concurrent metric recording', async () => {
      initializeMetrics();
      
      // Simulate concurrent requests
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            recordRequestDuration('GET', '/health', 200, 0.01);
            recordGitHubOAuthOperation('token_exchange', 'success');
            recordJWTOperation('issue', 'success');
          })
        );
      }
      
      await Promise.all(promises);
      
      const metrics = await getMetrics();
      expect(metrics).toContain('test_github_oauth_operations_total');
      expect(metrics).toContain('test_jwt_operations_total');
      expect(metrics).toContain('test_http_request_duration_seconds');
    });
  });
});
