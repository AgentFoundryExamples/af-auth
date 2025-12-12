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
import { validateBody, validateQuery, schemas, sanitizeInput } from './validation';

describe('Validation Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('validateBody', () => {
    it('should pass valid request body', async () => {
      app.post('/test', validateBody(schemas.tokenRefresh), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .send({ token: 'valid-token' })
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });

    it('should reject invalid request body', async () => {
      app.post('/test', validateBody(schemas.tokenRefresh), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .send({ token: '' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Invalid request data');
      expect(response.body.requestId).toBeDefined();
      expect(response.body.details).toBeInstanceOf(Array);
    });

    it('should sanitize validation errors in logs', async () => {
      app.post('/test', validateBody(schemas.tokenRefresh), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .send({ invalid: 'field' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.requestId).toBeDefined();
      // Verify that the actual invalid data is not in the response
      expect(JSON.stringify(response.body)).not.toContain('field');
    });
  });

  describe('validateQuery', () => {
    it('should pass valid query parameters', async () => {
      app.get('/test', validateQuery(schemas.tokenIssuanceQuery), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .query({ userId: '123e4567-e89b-12d3-a456-426614174000' })
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });

    it('should reject invalid query parameters', async () => {
      app.get('/test', validateQuery(schemas.tokenIssuanceQuery), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .query({ userId: 'not-a-uuid' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Invalid query parameters');
      expect(response.body.requestId).toBeDefined();
    });
  });

  describe('schemas.githubTokenRequest', () => {
    it('should accept userId', async () => {
      app.post('/test', validateBody(schemas.githubTokenRequest), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .send({ userId: '123e4567-e89b-12d3-a456-426614174000' })
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });

    it('should accept githubUserId', async () => {
      app.post('/test', validateBody(schemas.githubTokenRequest), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .send({ githubUserId: '12345' })
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });

    it('should reject when both fields are missing', async () => {
      app.post('/test', validateBody(schemas.githubTokenRequest), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid githubUserId format', async () => {
      app.post('/test', validateBody(schemas.githubTokenRequest), (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .send({ githubUserId: 'not-numeric' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('sanitizeInput', () => {
    it('should preserve normal objects', () => {
      const input = { name: 'test', value: 123 };
      const sanitized = sanitizeInput(input);
      expect(sanitized).toEqual(input);
    });

    it('should remove __proto__ property', () => {
      const input = { name: 'test', __proto__: { polluted: true } };
      const sanitized = sanitizeInput(input);
      expect(sanitized).toEqual({ name: 'test' });
      expect(sanitized.__proto__).not.toHaveProperty('polluted');
    });

    it('should remove constructor property', () => {
      const input = { name: 'test', constructor: 'malicious' };
      const sanitized = sanitizeInput(input);
      expect(sanitized).toEqual({ name: 'test' });
    });

    it('should remove prototype property', () => {
      const input = { name: 'test', prototype: 'malicious' };
      const sanitized = sanitizeInput(input);
      expect(sanitized).toEqual({ name: 'test' });
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'test',
          __proto__: { polluted: true },
          details: {
            age: 25,
            constructor: 'malicious',
          },
        },
      };
      const sanitized = sanitizeInput(input);
      expect(sanitized).toEqual({
        user: {
          name: 'test',
          details: {
            age: 25,
          },
        },
      });
    });

    it('should handle arrays', () => {
      const input = [
        { name: 'test1', __proto__: { polluted: true } },
        { name: 'test2', constructor: 'malicious' },
      ];
      const sanitized = sanitizeInput(input);
      expect(sanitized).toEqual([
        { name: 'test1' },
        { name: 'test2' },
      ]);
    });

    it('should handle null and undefined', () => {
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput(undefined)).toBe(undefined);
    });

    it('should handle primitive types', () => {
      expect(sanitizeInput('string')).toBe('string');
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(true)).toBe(true);
    });
  });
});
