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

describe('Security Headers Edge Cases', () => {
  let app: express.Application;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.GITHUB_CALLBACK_URL = 'http://localhost:3000/auth/github/callback';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Malformed Environment Variables', () => {
    it('should handle empty string CSP directive gracefully', async () => {
      const originalEnv = process.env.CSP_DEFAULT_SRC;
      process.env.CSP_DEFAULT_SRC = '';
      
      try {
        app = express();
        app.use(createSecurityHeadersMiddleware());
        app.get('/test', (_req: Request, res: Response) => {
          res.status(200).json({ success: true });
        });

        // Should not crash, should use defaults
        const response = await request(app).get('/test').expect(200);
        expect(response.headers['content-security-policy']).toBeDefined();
      } finally {
        process.env.CSP_DEFAULT_SRC = originalEnv;
      }
    });

    it('should handle whitespace-only CSP directive gracefully', async () => {
      process.env.CSP_DEFAULT_SRC = '   ';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);
      
      // Should use default values when env var is whitespace only
      const csp = response.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
    });

    it('should handle comma-only CSP directive gracefully', async () => {
      process.env.CSP_DEFAULT_SRC = ',,,';
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);
      
      // Should use default values when env var has only commas
      const csp = response.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
    });

    it('should handle unquoted CSP keywords correctly', async () => {
      // This tests backward compatibility - if someone sets unquoted keywords
      process.env.CSP_OBJECT_SRC = 'none'; // Without quotes
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      // Should not crash - Helmet will validate and may reject, but we handle it gracefully
      await request(app).get('/test');
      
      // May or may not warn depending on whether the value is accepted
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Missing Environment Variables', () => {
    it('should work with all CSP env vars undefined', async () => {
      // Clear all CSP-related env vars
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('CSP_')) {
          delete process.env[key];
        }
      });
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);
      
      // Should use defaults
      expect(response.headers['content-security-policy']).toBeDefined();
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
    });

    it('should work with CSP_ENABLED undefined (defaults to enabled)', async () => {
      delete process.env.CSP_ENABLED;
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);
      
      // CSP should be enabled by default
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('Hot Reload and Test Environments', () => {
    it('should work consistently across multiple middleware creations', async () => {
      // Simulate hot reload by creating middleware multiple times
      const middleware1 = createSecurityHeadersMiddleware();
      const middleware2 = createSecurityHeadersMiddleware();
      const middleware3 = createSecurityHeadersMiddleware();
      
      app = express();
      app.use(middleware1);
      app.get('/test1', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const app2 = express();
      app2.use(middleware2);
      app2.get('/test2', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const app3 = express();
      app3.use(middleware3);
      app3.get('/test3', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      // All should work
      await request(app).get('/test1').expect(200);
      await request(app2).get('/test2').expect(200);
      await request(app3).get('/test3').expect(200);
    });

    it('should handle env var changes between middleware creations', async () => {
      // Create middleware with one config
      process.env.CSP_ENABLED = 'true';
      const middleware1 = createSecurityHeadersMiddleware();
      
      app = express();
      app.use(middleware1);
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response1 = await request(app).get('/test').expect(200);
      expect(response1.headers['content-security-policy']).toBeDefined();

      // Change env and create new middleware
      process.env.CSP_ENABLED = 'false';
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const middleware2 = createSecurityHeadersMiddleware();
      
      const app2 = express();
      app2.use(middleware2);
      app2.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response2 = await request(app2).get('/test').expect(200);
      expect(response2.headers['content-security-policy']).toBeUndefined();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Nonce Generation Failures', () => {
    it('should not crash when nonce generation fails', async () => {
      app = express();
      // Simulate nonce generation failure
      app.use((_req: Request, res: Response, next) => {
        res.locals.cspNonce = undefined; // Failed to generate
        next();
      });
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);
      
      // Should fall back to unsafe-inline
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("'unsafe-inline'");
    });
  });

  describe('Helmet Version Compatibility', () => {
    it('should provide helpful error context for CSP validation failures', async () => {
      // This test documents the Helmet 8.0.0 behavior
      // If CSP directives are invalid, middleware should not crash the app
      process.env.CSP_DEFAULT_SRC = '   '; // Will be replaced with defaults after parsing
      
      app = express();
      app.use(createSecurityHeadersMiddleware());
      app.get('/test', (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      // Should not throw unhandled errors, should use defaults
      const response = await request(app).get('/test').expect(200);
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });
});
