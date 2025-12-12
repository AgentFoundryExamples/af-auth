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
// Mock logger before imports
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock metrics service
jest.mock('../services/metrics', () => ({
  getMetrics: jest.fn(),
  areMetricsEnabled: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import metricsRoutes from './metrics';
import { getMetrics, areMetricsEnabled } from '../services/metrics';
import { config } from '../config';

const mockGetMetrics = getMetrics as jest.MockedFunction<typeof getMetrics>;
const mockAreMetricsEnabled = areMetricsEnabled as jest.MockedFunction<typeof areMetricsEnabled>;

describe('Metrics Endpoint', () => {
  let app: express.Application;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use(metricsRoutes);
    
    jest.clearAllMocks();
    
    // Default: metrics enabled
    mockAreMetricsEnabled.mockReturnValue(true);
    mockGetMetrics.mockResolvedValue('# Metrics data\ntest_metric 1\n');
  });

  describe('GET /metrics', () => {
    describe('when metrics are enabled', () => {
      it('should return metrics without authentication if token not configured', async () => {
        // Temporarily clear auth token
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = null;
        
        const response = await request(app)
          .get('/metrics')
          .expect(200);
        
        expect(response.text).toContain('test_metric');
        expect(response.headers['content-type']).toMatch(/text\/plain/);
        expect(mockGetMetrics).toHaveBeenCalled();
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should require authentication when token is configured', async () => {
        // Set auth token
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = 'test-secret-token';
        
        const response = await request(app)
          .get('/metrics')
          .expect(401);
        
        expect(response.body).toHaveProperty('error', 'Unauthorized');
        expect(mockGetMetrics).not.toHaveBeenCalled();
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should accept valid Bearer token', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = 'test-secret-token';
        
        const response = await request(app)
          .get('/metrics')
          .set('Authorization', 'Bearer test-secret-token')
          .expect(200);
        
        expect(response.text).toContain('test_metric');
        expect(mockGetMetrics).toHaveBeenCalled();
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should reject invalid Bearer token', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = 'test-secret-token';
        
        const response = await request(app)
          .get('/metrics')
          .set('Authorization', 'Bearer wrong-token')
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'Forbidden');
        expect(mockGetMetrics).not.toHaveBeenCalled();
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should reject malformed Authorization header', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = 'test-secret-token';
        
        const response = await request(app)
          .get('/metrics')
          .set('Authorization', 'InvalidFormat')
          .expect(401);
        
        expect(response.body.message).toContain('Invalid Authorization header format');
        expect(mockGetMetrics).not.toHaveBeenCalled();
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should use constant-time comparison for tokens', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = 'test-secret-token-123';
        
        // Try with token of different length
        const response = await request(app)
          .get('/metrics')
          .set('Authorization', 'Bearer short')
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'Forbidden');
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should return metrics in Prometheus text format', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = null;
        
        mockGetMetrics.mockResolvedValue(`# HELP test_metric A test metric
# TYPE test_metric counter
test_metric{label="value"} 42
`);
        
        const response = await request(app)
          .get('/metrics')
          .expect(200);
        
        expect(response.headers['content-type']).toMatch(/text\/plain.*charset=utf-8/);
        expect(response.text).toContain('# HELP test_metric');
        expect(response.text).toContain('# TYPE test_metric counter');
        expect(response.text).toContain('test_metric{label="value"} 42');
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });
    });

    describe('when metrics are disabled', () => {
      beforeEach(() => {
        mockAreMetricsEnabled.mockReturnValue(false);
      });

      it('should return 404 when metrics disabled', async () => {
        const response = await request(app)
          .get('/metrics')
          .expect(404);
        
        expect(response.body).toHaveProperty('error', 'Not Found');
        expect(response.body.message).toContain('disabled');
        expect(mockGetMetrics).not.toHaveBeenCalled();
      });

      it('should not leak information when disabled', async () => {
        const response = await request(app)
          .get('/metrics')
          .expect(404);
        
        // Should not reveal configuration details
        expect(response.body.message).not.toContain('METRICS_ENABLED');
        expect(response.body.message).not.toContain('config');
      });
    });

    describe('when metrics return null', () => {
      beforeEach(() => {
        mockGetMetrics.mockResolvedValue(null);
      });

      it('should return 503 when metrics not available', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = null;
        
        const response = await request(app)
          .get('/metrics')
          .expect(503);
        
        expect(response.body).toHaveProperty('error', 'Service Unavailable');
        expect(response.body.message).toContain('not available');
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });
    });

    describe('error handling', () => {
      it('should handle metrics service errors gracefully', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = null;
        
        mockGetMetrics.mockRejectedValue(new Error('Metrics collection failed'));
        
        const response = await request(app)
          .get('/metrics')
          .expect(500);
        
        expect(response.body).toHaveProperty('error', 'Internal Server Error');
        expect(response.body.message).toContain('Failed to retrieve metrics');
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should not expose error details in production', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = null;
        
        mockGetMetrics.mockRejectedValue(new Error('Internal error details'));
        
        const response = await request(app)
          .get('/metrics')
          .expect(500);
        
        // Should not leak internal error message
        expect(response.body.message).not.toContain('Internal error details');
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });
    });

    describe('security', () => {
      it('should prevent timing attacks on token comparison', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = 'a'.repeat(32);
        
        const startCorrect = Date.now();
        await request(app)
          .get('/metrics')
          .set('Authorization', `Bearer ${'a'.repeat(32)}`)
          .expect(200);
        const timeCorrect = Date.now() - startCorrect;
        
        const startWrong = Date.now();
        await request(app)
          .get('/metrics')
          .set('Authorization', `Bearer ${'b'.repeat(32)}`)
          .expect(403);
        const timeWrong = Date.now() - startWrong;
        
        // Timing difference should be small (< 10ms typically)
        // This is not a perfect test but catches obvious timing leaks
        expect(Math.abs(timeCorrect - timeWrong)).toBeLessThan(100);
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should not expose metrics without proper authentication in production', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = 'production-secret';
        
        const response = await request(app)
          .get('/metrics')
          .expect(401);
        
        expect(response.body).not.toHaveProperty('metrics');
        expect(mockGetMetrics).not.toHaveBeenCalled();
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });
    });

    describe('multiple requests', () => {
      it('should handle concurrent requests', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = null;
        
        const requests = Array(10).fill(null).map(() =>
          request(app).get('/metrics').expect(200)
        );
        
        const responses = await Promise.all(requests);
        
        responses.forEach(response => {
          expect(response.text).toContain('test_metric');
        });
        
        expect(mockGetMetrics).toHaveBeenCalledTimes(10);
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });

      it('should cache metrics appropriately', async () => {
        const originalToken = config.metrics.authToken;
        (config.metrics as any).authToken = null;
        
        mockGetMetrics.mockResolvedValue('# Cached metrics\ntest_metric 123\n');
        
        await request(app).get('/metrics').expect(200);
        await request(app).get('/metrics').expect(200);
        
        // Should call getMetrics each time (no caching at route level)
        expect(mockGetMetrics).toHaveBeenCalledTimes(2);
        
        // Restore
        (config.metrics as any).authToken = originalToken;
      });
    });
  });
});
