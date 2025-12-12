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
import express, { Request, Response } from 'express';
import { createSecurityHeadersMiddleware } from './security-headers';

describe('Security Headers Middleware', () => {
  let app: express.Application;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    jest.resetModules();
    process.env = { ...originalEnv };
    
    // Set up minimal test environment
    process.env.NODE_ENV = 'test';
    process.env.GITHUB_CALLBACK_URL = 'http://localhost:3000/auth/github/callback';
    
    // Create fresh app for each test
    app = express();
    app.use(createSecurityHeadersMiddleware());
    app.get('/test', (_req: Request, res: Response) => {
      res.status(200).json({ success: true });
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Content-Security-Policy', () => {
    it('should apply CSP headers with default directives', async () => {
      const response = await request(app).get('/test').expect(200);

      expect(response.headers['content-security-policy']).toBeDefined();
      const csp = response.headers['content-security-policy'];
      
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should include GitHub domains in CSP for OAuth', async () => {
      const response = await request(app).get('/test').expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain('github.com');
    });

    it('should allow inline scripts and styles for pages', async () => {
      const response = await request(app).get('/test').expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('should allow custom CSP directives from environment', async () => {
      process.env.CSP_IMG_SRC = "'self',https://cdn.example.com";
      
      // Recreate middleware with new env
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("img-src 'self' https://cdn.example.com");
    });

    it('should disable CSP when CSP_ENABLED is false', async () => {
      process.env.CSP_ENABLED = 'false';
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['content-security-policy']).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Content-Security-Policy is DISABLED')
      );
      
      consoleSpy.mockRestore();
    });

    it('should include upgrade-insecure-requests in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CSP_UPGRADE_INSECURE_REQUESTS = 'true';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain('upgrade-insecure-requests');
    });

    it('should not include upgrade-insecure-requests in development', async () => {
      // Test environment is 'test', not 'production', so upgrade-insecure-requests should not be included
      // The beforeEach sets NODE_ENV to 'test', which is not 'production'
      const response = await request(app).get('/test').expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).not.toContain('upgrade-insecure-requests');
    });
  });

  describe('Strict-Transport-Security (HSTS)', () => {
    it('should not apply HSTS in development', async () => {
      process.env.NODE_ENV = 'development';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['strict-transport-security']).toBeUndefined();
    });

    it('should apply HSTS in production with default max-age', async () => {
      process.env.NODE_ENV = 'production';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(response.headers['strict-transport-security']).toContain('includeSubDomains');
    });

    it('should respect custom HSTS max-age', async () => {
      process.env.NODE_ENV = 'production';
      process.env.HSTS_MAX_AGE = '63072000'; // 2 years
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['strict-transport-security']).toContain('max-age=63072000');
    });

    it('should include preload when enabled', async () => {
      process.env.NODE_ENV = 'production';
      process.env.HSTS_PRELOAD = 'true';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['strict-transport-security']).toContain('preload');
    });

    it('should allow disabling HSTS explicitly', async () => {
      process.env.NODE_ENV = 'production';
      process.env.HSTS_ENABLED = 'false';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['strict-transport-security']).toBeUndefined();
    });
  });

  describe('X-Frame-Options', () => {
    it('should apply X-Frame-Options with DENY by default', async () => {
      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should respect custom X-Frame-Options value', async () => {
      process.env.X_FRAME_OPTIONS = 'SAMEORIGIN';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('should default to DENY for invalid X-Frame-Options values', async () => {
      process.env.X_FRAME_OPTIONS = 'INVALID_VALUE';
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid X_FRAME_OPTIONS value')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('X-Content-Type-Options', () => {
    it('should apply X-Content-Type-Options by default', async () => {
      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should allow disabling X-Content-Type-Options', async () => {
      process.env.X_CONTENT_TYPE_OPTIONS = 'false';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-content-type-options']).toBeUndefined();
    });
  });

  describe('Referrer-Policy', () => {
    it('should apply Referrer-Policy with default value', async () => {
      const response = await request(app).get('/test').expect(200);

      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should respect custom Referrer-Policy', async () => {
      process.env.REFERRER_POLICY = 'no-referrer';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['referrer-policy']).toBe('no-referrer');
    });
  });

  describe('Permissions-Policy', () => {
    it('should apply Permissions-Policy with all features disabled by default', async () => {
      const response = await request(app).get('/test').expect(200);

      expect(response.headers['permissions-policy']).toBeDefined();
      const policy = response.headers['permissions-policy'];
      
      expect(policy).toContain('camera=()');
      expect(policy).toContain('microphone=()');
      expect(policy).toContain('geolocation=()');
      expect(policy).toContain('payment=()');
      expect(policy).toContain('usb=()');
    });

    it('should allow custom Permissions-Policy values', async () => {
      process.env.PERMISSIONS_POLICY_CAMERA = 'self';
      process.env.PERMISSIONS_POLICY_MICROPHONE = 'self,https://trusted.com';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      const policy = response.headers['permissions-policy'];
      expect(policy).toContain('camera=(self)');
      expect(policy).toContain('microphone=(self "https://trusted.com")');
    });
  });

  describe('Additional Security Headers', () => {
    it('should apply X-DNS-Prefetch-Control', async () => {
      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('should apply X-Download-Options', async () => {
      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-download-options']).toBe('noopen');
    });

    it('should apply X-Permitted-Cross-Domain-Policies', async () => {
      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
    });
  });

  describe('Multiple Middleware Layers', () => {
    it('should not duplicate headers when middleware is applied multiple times', async () => {
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.use(createSecurityHeadersMiddleware()); // Apply twice
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      // Check that CSP is not duplicated
      const cspHeaders = response.headers['content-security-policy'];
      if (Array.isArray(cspHeaders)) {
        // If it's an array, helmet applied the header multiple times
        expect(cspHeaders.length).toBe(1);
      } else {
        // Single string is correct
        expect(typeof cspHeaders).toBe('string');
      }
    });
  });

  describe('Coverage Across Different Routes', () => {
    beforeEach(() => {
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/api/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });
      app.post('/api/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });
      app.get('/health', (_req: Request, res: Response) => {
        res.status(200).json({ status: 'healthy' });
      });
    });

    it('should apply headers to GET endpoints', async () => {
      const response = await request(app).get('/api/test').expect(200);

      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should apply headers to POST endpoints', async () => {
      const response = await request(app).post('/api/test').expect(200);

      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should apply headers to health check endpoints', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should not break when response is already sent', async () => {
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
        // Middleware continues after response is sent
      });

      await request(app).get('/test').expect(200);
      // No errors should be thrown
    });

    it('should handle invalid GITHUB_CALLBACK_URL gracefully', async () => {
      process.env.GITHUB_CALLBACK_URL = 'not-a-valid-url';
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      // Should still apply security headers with fallback domain
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'FATAL: Invalid GITHUB_CALLBACK_URL. Could not parse origin.',
        expect.any(Object)
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to default GitHub domain')
      );
      
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });
});
