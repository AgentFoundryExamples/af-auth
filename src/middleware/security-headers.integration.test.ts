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
import request from 'supertest';
import app from '../server';

/**
 * Integration tests for security headers middleware
 * Tests that security headers are applied across all application endpoints
 */
describe('Security Headers Integration Tests', () => {
  // Common security headers that should be present on all responses
  const commonHeaders = [
    'x-frame-options',
    'x-content-type-options',
    'x-dns-prefetch-control',
    'x-download-options',
    'referrer-policy',
    'permissions-policy',
  ];

  describe('Health and Readiness Endpoints', () => {
    it('should apply security headers to /health endpoint', async () => {
      const response = await request(app).get('/health');

      // Check common headers
      commonHeaders.forEach((header) => {
        expect(response.headers[header]).toBeDefined();
      });

      // Check CSP
      expect(response.headers['content-security-policy']).toBeDefined();
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should apply security headers to /ready endpoint', async () => {
      const response = await request(app).get('/ready');

      commonHeaders.forEach((header) => {
        expect(response.headers[header]).toBeDefined();
      });

      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should apply security headers to /live endpoint', async () => {
      const response = await request(app).get('/live').expect(200);

      commonHeaders.forEach((header) => {
        expect(response.headers[header]).toBeDefined();
      });
    });
  });

  describe('404 Not Found Endpoint', () => {
    it('should apply security headers to 404 responses', async () => {
      const response = await request(app).get('/nonexistent-endpoint').expect(404);

      commonHeaders.forEach((header) => {
        expect(response.headers[header]).toBeDefined();
      });

      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('Security Headers Content Validation', () => {
    it('should have X-Frame-Options set to DENY', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should have X-Content-Type-Options set to nosniff', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should have X-DNS-Prefetch-Control set to off', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('should have X-Download-Options set to noopen', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-download-options']).toBe('noopen');
    });

    it('should have Referrer-Policy set', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should have Permissions-Policy with restricted features', async () => {
      const response = await request(app).get('/health');

      const policy = response.headers['permissions-policy'];
      expect(policy).toBeDefined();
      expect(policy).toContain('camera=()');
      expect(policy).toContain('microphone=()');
      expect(policy).toContain('geolocation=()');
    });

    it('should have Content-Security-Policy with safe directives', async () => {
      const response = await request(app).get('/health');

      const csp = response.headers['content-security-policy'];
      expect(csp).toBeDefined();

      // Check important CSP directives
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");

      // Should allow inline scripts/styles for React pages
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");

      // Should allow GitHub for OAuth
      expect(csp).toContain('github.com');
    });
  });

  describe('HSTS in Test Environment', () => {
    it('should not apply HSTS in non-production environment', async () => {
      const response = await request(app).get('/health');

      // HSTS should not be set in test environment
      expect(response.headers['strict-transport-security']).toBeUndefined();
    });
  });

  describe('Multiple Requests Consistency', () => {
    it('should apply consistent headers across multiple requests', async () => {
      const responses = await Promise.all([
        request(app).get('/health'),
        request(app).get('/ready'),
        request(app).get('/live'),
      ]);

      // All responses should have the same core security headers
      responses.forEach((response) => {
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['content-security-policy']).toBeDefined();
      });
    });
  });

  describe('CSP Allows OAuth Flow', () => {
    it('should include github.com in CSP connect-src for OAuth', async () => {
      const response = await request(app).get('/health');

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain('connect-src');
      expect(csp).toContain('github.com');
    });

    it('should include github.com in CSP form-action for OAuth', async () => {
      const response = await request(app).get('/health');

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain('form-action');
      expect(csp).toContain('github.com');
    });
  });
});
