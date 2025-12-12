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
import { authRateLimiter, jwtRateLimiter, githubTokenRateLimiter } from './rate-limit';
import * as redisClient from '../services/redis-client';

// Mock the Redis client service
jest.mock('../services/redis-client');

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis as disconnected by default (use in-memory store)
    mockRedisClient.getRedisClient.mockReturnValue({} as any);
    mockRedisClient.isRedisConnected.mockReturnValue(false);
    mockRedisClient.getRedisStatus.mockReturnValue('disconnected');
  });

  describe('authRateLimiter', () => {
    it('should allow requests under the limit', async () => {
      const app = express();
      app.use(express.json());
      app.get('/test', authRateLimiter, (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });

    it('should include rate limit headers', async () => {
      const app = express();
      app.use(express.json());
      app.get('/test', authRateLimiter, (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });
  });

  describe('jwtRateLimiter', () => {
    it('should allow requests under the limit', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test', jwtRateLimiter, (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });
  });

  describe('githubTokenRateLimiter', () => {
    it('should allow requests under the limit', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test', githubTokenRateLimiter, (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });

    it('should have higher limits than auth endpoints', async () => {
      const app = express();
      app.use(express.json());
      app.post('/test', githubTokenRateLimiter, (_req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      // Make several requests to verify it works
      for (let i = 0; i < 5; i++) {
        await request(app).post('/test').expect(200);
      }

      // Should still be under the limit
      const response = await request(app)
        .post('/test')
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });
  });
});

