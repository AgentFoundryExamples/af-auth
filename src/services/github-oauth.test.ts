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

// Mock Redis client first
jest.mock('./redis-client');

// Mock the logger
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the config module
jest.mock('../config', () => ({
  config: {
    github: {
      appId: '123456',
      installationId: '12345678',
      privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      callbackUrl: 'http://localhost:3000/auth/github/callback',
    },
    redis: {
      host: 'localhost',
      port: 6379,
      password: null,
      db: 0,
      connectTimeout: 5000,
      maxRetries: 3,
      retryDelay: 1000,
      maxRetriesPerRequest: 3,
      stateTtlSeconds: 600,
    },
    session: {
      maxAge: 600000, // 10 minutes
    },
    logging: {
      level: 'info',
      pretty: false,
    },
  },
}));

import {
  generateState,
  validateState,
  getAuthorizationUrl,
  calculateTokenExpiration,
  isTokenExpiringSoon,
} from './github-oauth';
import { config } from '../config';
import * as redisClient from './redis-client';

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;

describe('GitHub OAuth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis operations
    mockRedisClient.executeRedisOperation.mockImplementation(async (fn) => {
      return fn();
    });
    
    mockRedisClient.getRedisClient.mockReturnValue({
      setex: jest.fn().mockResolvedValue('OK'),
      pipeline: jest.fn(() => ({
        get: jest.fn(),
        del: jest.fn(),
        exec: jest.fn().mockResolvedValue([
          [null, JSON.stringify({ state: 'test', timestamp: Date.now(), requestId: 'test' })],
          [null, 1],
        ]),
      })),
    } as any);
  });

  describe('generateState', () => {
    it('should generate a unique state token', async () => {
      const state1 = await generateState();
      const state2 = await generateState();

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
      expect(state1.length).toBe(64); // 32 bytes * 2 (hex)
    });
    
    it('should store state in Redis with TTL', async () => {
      const setexMock = jest.fn().mockResolvedValue('OK');
      mockRedisClient.getRedisClient.mockReturnValue({
        setex: setexMock,
      } as any);
      
      await generateState();
      
      expect(setexMock).toHaveBeenCalled();
    });
  });

  describe('validateState', () => {
    it('should validate a state from Redis', async () => {
      const stateData = {
        state: 'valid-state',
        timestamp: Date.now(),
        requestId: 'test-request-id',
      };
      
      mockRedisClient.getRedisClient.mockReturnValue({
        pipeline: jest.fn(() => ({
          get: jest.fn(),
          del: jest.fn(),
          exec: jest.fn().mockResolvedValue([
            [null, JSON.stringify(stateData)],
            [null, 1],
          ]),
        })),
      } as any);
      
      const result = await validateState('valid-state');

      expect(result).toEqual(stateData);
    });

    it('should reject an unknown state', async () => {
      mockRedisClient.getRedisClient.mockReturnValue({
        pipeline: jest.fn(() => ({
          get: jest.fn(),
          del: jest.fn(),
          exec: jest.fn().mockResolvedValue([
            [null, null],
            [null, 0],
          ]),
        })),
      } as any);
      
      const result = await validateState('unknown-state');

      expect(result).toBeNull();
    });

    it('should reject an expired state', async () => {
      const expiredState = {
        state: 'expired-state',
        timestamp: Date.now() - (config.redis.stateTtlSeconds * 1000 + 1000), // Expired
        requestId: 'test-request-id',
      };
      
      mockRedisClient.getRedisClient.mockReturnValue({
        pipeline: jest.fn(() => ({
          get: jest.fn(),
          del: jest.fn(),
          exec: jest.fn().mockResolvedValue([
            [null, JSON.stringify(expiredState)],
            [null, 1],
          ]),
        })),
      } as any);
      
      const result = await validateState('expired-state');

      expect(result).toBeNull();
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct GitHub authorization URL', () => {
      const state = 'test-state-token';
      const url = getAuthorizationUrl(state);

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain(`client_id=${config.github.clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(config.github.callbackUrl)}`);
      expect(url).toContain(`state=${state}`);
      // Scope is no longer included in GitHub App authorization
      expect(url).not.toContain('scope=');
    });
  });

  describe('calculateTokenExpiration', () => {
    it('should calculate correct expiration date', () => {
      const expiresIn = 3600; // 1 hour
      const before = Date.now();
      const expiration = calculateTokenExpiration(expiresIn);
      const after = Date.now();

      expect(expiration).not.toBeNull();
      expect(expiration!.getTime()).toBeGreaterThanOrEqual(before + expiresIn * 1000);
      expect(expiration!.getTime()).toBeLessThanOrEqual(after + expiresIn * 1000);
    });

    it('should return null when expiresIn is not provided', () => {
      const expiration = calculateTokenExpiration(undefined);

      expect(expiration).toBeNull();
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('should return false for null expiration date', () => {
      const result = isTokenExpiringSoon(null, 3600);
      
      expect(result).toBe(false);
    });

    it('should return true when token expires within threshold', () => {
      // Token expires in 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const threshold = 3600; // 1 hour
      
      const result = isTokenExpiringSoon(expiresAt, threshold);
      
      expect(result).toBe(true);
    });

    it('should return false when token expires beyond threshold', () => {
      // Token expires in 2 hours
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const threshold = 3600; // 1 hour
      
      const result = isTokenExpiringSoon(expiresAt, threshold);
      
      expect(result).toBe(false);
    });

    it('should return true for already expired tokens', () => {
      // Token expired 1 hour ago
      const expiresAt = new Date(Date.now() - 60 * 60 * 1000);
      const threshold = 3600;
      
      const result = isTokenExpiringSoon(expiresAt, threshold);
      
      expect(result).toBe(true);
    });

    it('should handle custom thresholds', () => {
      // Token expires in 10 minutes
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      
      // Should be expiring soon with 15-minute threshold
      expect(isTokenExpiringSoon(expiresAt, 15 * 60)).toBe(true);
      
      // Should not be expiring soon with 5-minute threshold
      expect(isTokenExpiringSoon(expiresAt, 5 * 60)).toBe(false);
    });
  });
});
