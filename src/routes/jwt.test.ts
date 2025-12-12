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
jest.mock('../utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
    fatal: jest.fn(),
    trace: jest.fn(),
    level: 'info',
    levels: {
      values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 },
      labels: { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' },
    },
  };
  return {
    __esModule: true,
    default: mockLogger,
  };
});

// Mock the GitHub OAuth service
jest.mock('../services/github-oauth');

// Mock the JWT service
jest.mock('../services/jwt');

import request from 'supertest';
import { app } from '../server';
import * as jwtService from '../services/jwt';

const mockJwtService = jwtService as jest.Mocked<typeof jwtService>;

describe('JWT Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/token', () => {
    it('should refresh a valid token', async () => {
      const oldToken = 'valid.old.token';
      const newToken = 'new.fresh.token';

      mockJwtService.refreshJWT.mockResolvedValue(newToken);

      const response = await request(app)
        .post('/api/token')
        .send({ token: oldToken })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('token', newToken);
      expect(response.body).toHaveProperty('expiresIn', '30d');
      expect(mockJwtService.refreshJWT).toHaveBeenCalledWith(oldToken);
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .post('/api/token')
        .send({})
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('requestId');
    });

    it('should reject expired token', async () => {
      const expiredToken = 'expired.token.here';

      mockJwtService.refreshJWT.mockRejectedValue(new Error('EXPIRED_TOKEN'));

      const response = await request(app)
        .post('/api/token')
        .send({ token: expiredToken })
        .expect(401)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'EXPIRED_TOKEN');
      expect(response.body.message).toContain('expired');
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid.token.here';

      mockJwtService.refreshJWT.mockRejectedValue(new Error('INVALID_TOKEN'));

      const response = await request(app)
        .post('/api/token')
        .send({ token: invalidToken })
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'INVALID_TOKEN');
      expect(response.body.message).toContain('invalid');
    });

    it('should reject token for non-existent user', async () => {
      const token = 'token.for.deleted.user';

      mockJwtService.refreshJWT.mockRejectedValue(new Error('USER_NOT_FOUND'));

      const response = await request(app)
        .post('/api/token')
        .send({ token })
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'USER_NOT_FOUND');
    });

    it('should reject revoked token', async () => {
      const token = 'revoked.token.here';

      mockJwtService.refreshJWT.mockRejectedValue(new Error('TOKEN_REVOKED'));

      const response = await request(app)
        .post('/api/token')
        .send({ token })
        .expect(401)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'TOKEN_REVOKED');
      expect(response.body.message).toContain('revoked');
    });

    it('should reject token for user with revoked whitelist', async () => {
      const token = 'token.for.revoked.user';

      mockJwtService.refreshJWT.mockRejectedValue(new Error('WHITELIST_REVOKED'));

      const response = await request(app)
        .post('/api/token')
        .send({ token })
        .expect(403)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'WHITELIST_REVOKED');
      expect(response.body.message).toContain('revoked');
    });

    it('should handle unexpected errors gracefully', async () => {
      const token = 'valid.token';

      mockJwtService.refreshJWT.mockRejectedValue(new Error('Unexpected database error'));

      const response = await request(app)
        .post('/api/token')
        .send({ token })
        .expect(500)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'INTERNAL_ERROR');
    });

    it('should reject non-string token', async () => {
      const response = await request(app)
        .post('/api/token')
        .send({ token: 12345 })
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('GET /api/token', () => {
    it('should generate token for valid user', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const token = 'generated.jwt.token';

      mockJwtService.generateJWT.mockResolvedValue(token);

      const response = await request(app)
        .get('/api/token')
        .query({ userId })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('token', token);
      expect(response.body).toHaveProperty('expiresIn', '30d');
      expect(mockJwtService.generateJWT).toHaveBeenCalledWith(userId);
    });

    it('should reject request without userId', async () => {
      const response = await request(app)
        .get('/api/token')
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('requestId');
    });

    it('should handle non-existent user', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';

      mockJwtService.generateJWT.mockRejectedValue(new Error('User not found'));

      const response = await request(app)
        .get('/api/token')
        .query({ userId })
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'USER_NOT_FOUND');
    });

    it('should handle unexpected errors', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';

      mockJwtService.generateJWT.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/token')
        .query({ userId })
        .expect(500)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'INTERNAL_ERROR');
    });

    it('should reject non-uuid userId', async () => {
      const response = await request(app)
        .get('/api/token')
        .query({ userId: 'not-a-uuid' })
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('GET /api/jwks', () => {
    it('should return public key in PEM format', async () => {
      const publicKey = '-----BEGIN PUBLIC KEY-----\ntest-key\n-----END PUBLIC KEY-----';

      mockJwtService.getPublicKeyForVerification.mockReturnValue(publicKey);

      const response = await request(app)
        .get('/api/jwks')
        .expect(200)
        .expect('Content-Type', 'text/plain; charset=utf-8');

      expect(response.text).toBe(publicKey);
      expect(response.text).toContain('BEGIN PUBLIC KEY');
      expect(mockJwtService.getPublicKeyForVerification).toHaveBeenCalled();
    });

    it('should handle errors when retrieving public key', async () => {
      mockJwtService.getPublicKeyForVerification.mockImplementation(() => {
        throw new Error('Key file not found');
      });

      const response = await request(app)
        .get('/api/jwks')
        .expect(500)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'INTERNAL_ERROR');
    });
  });

  describe('GET /.well-known/jwks.json', () => {
    it('should return JWKS with public key', async () => {
      const publicKey = '-----BEGIN PUBLIC KEY-----\ntest-key\n-----END PUBLIC KEY-----';

      mockJwtService.getPublicKeyForVerification.mockReturnValue(publicKey);

      const response = await request(app)
        .get('/.well-known/jwks.json')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('publicKeyEndpoint', '/api/jwks');
      expect(response.body).toHaveProperty('algorithm', 'RS256');
      expect(response.body).toHaveProperty('publicKeyPEM', publicKey);
      expect(response.body).toHaveProperty('keys');
      expect(Array.isArray(response.body.keys)).toBe(true);
      expect(mockJwtService.getPublicKeyForVerification).toHaveBeenCalled();
    });

    it('should handle errors when retrieving JWKS', async () => {
      mockJwtService.getPublicKeyForVerification.mockImplementation(() => {
        throw new Error('Key file not found');
      });

      const response = await request(app)
        .get('/.well-known/jwks.json')
        .expect(500)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'INTERNAL_ERROR');
    });
  });

  describe('POST /api/token/revoke', () => {
    beforeEach(() => {
      // Mock the revocation service to be available
      const tokenRevocation = require('../services/token-revocation');
      jest.spyOn(tokenRevocation, 'revokeToken');
    });

    it('should successfully revoke a valid token', async () => {
      const { revokeToken } = require('../services/token-revocation');
      
      revokeToken.mockResolvedValue({
        success: true,
        jti: 'test-jti-123',
      });

      const response = await request(app)
        .post('/api/token/revoke')
        .send({
          token: 'valid.token.here',
          reason: 'User request',
          revokedBy: 'admin-user',
        })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('jti', 'test-jti-123');
      expect(revokeToken).toHaveBeenCalledWith('valid.token.here', 'admin-user', 'User request');
    });

    it('should handle revocation failure', async () => {
      const { revokeToken } = require('../services/token-revocation');
      
      revokeToken.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      const response = await request(app)
        .post('/api/token/revoke')
        .send({ token: 'invalid.token.here' })
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'REVOCATION_FAILED');
      expect(response.body.message).toBe('Invalid token');
    });

    it('should require token in request', async () => {
      const response = await request(app)
        .post('/api/token/revoke')
        .send({})
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
    });
  });

  describe('GET /api/token/revocation-status', () => {
    beforeEach(() => {
      const tokenRevocation = require('../services/token-revocation');
      jest.spyOn(tokenRevocation, 'getRevocationStatus');
    });

    it('should return revocation details for revoked token', async () => {
      const { getRevocationStatus } = require('../services/token-revocation');
      
      const mockRevocationDetails = {
        jti: 'revoked-jti',
        userId: 'user-123',
        revokedAt: new Date(),
        revokedBy: 'admin-user',
        reason: 'Security incident',
        tokenExpiresAt: new Date(),
      };

      getRevocationStatus.mockResolvedValue(mockRevocationDetails);

      const response = await request(app)
        .get('/api/token/revocation-status')
        .query({ jti: 'revoked-jti' })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('revoked', true);
      expect(response.body).toHaveProperty('details');
      expect(response.body.details.jti).toBe('revoked-jti');
    });

    it('should return false for non-revoked token', async () => {
      const { getRevocationStatus } = require('../services/token-revocation');
      
      getRevocationStatus.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/token/revocation-status')
        .query({ jti: 'valid-jti' })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('revoked', false);
      expect(response.body).toHaveProperty('jti', 'valid-jti');
    });

    it('should require jti parameter', async () => {
      const response = await request(app)
        .get('/api/token/revocation-status')
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
    });
  });

  describe('JWT expiration metadata in responses', () => {
    it('GET /api/token should return configured expiresIn and expiresAt', async () => {
      mockJwtService.generateJWT.mockResolvedValue('mock-jwt-token');

      const response = await request(app)
        .get('/api/token')
        .query({ userId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('token', 'mock-jwt-token');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('expiresAt');
      
      // Verify expiresIn matches config format (e.g., "30d", "7d", "24h")
      expect(response.body.expiresIn).toMatch(/^\d+[smhd]$/);
      
      // Verify expiresAt is a valid ISO timestamp
      expect(() => new Date(response.body.expiresAt)).not.toThrow();
      const expiresAt = new Date(response.body.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('POST /api/token should return configured expiresIn and expiresAt', async () => {
      mockJwtService.refreshJWT.mockResolvedValue('new-mock-jwt-token');

      const response = await request(app)
        .post('/api/token')
        .send({ token: 'old-jwt-token' })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('token', 'new-mock-jwt-token');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('expiresAt');
      
      // Verify expiresIn matches config format
      expect(response.body.expiresIn).toMatch(/^\d+[smhd]$/);
      
      // Verify expiresAt is a valid ISO timestamp in the future
      expect(() => new Date(response.body.expiresAt)).not.toThrow();
      const expiresAt = new Date(response.body.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return expiresAt timestamp consistent with expiresIn duration', async () => {
      mockJwtService.generateJWT.mockResolvedValue('mock-jwt-token');

      const beforeRequest = Date.now();
      const response = await request(app)
        .get('/api/token')
        .query({ userId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(200)
        .expect('Content-Type', /json/);
      const afterRequest = Date.now();

      const expiresAt = new Date(response.body.expiresAt).getTime();
      
      // Parse expiresIn to seconds
      const expiresIn = response.body.expiresIn;
      const match = expiresIn.match(/^(\d+)([smhd])$/);
      expect(match).toBeTruthy();
      
      const value = parseInt(match[1], 10);
      const unit = match[2];
      let seconds = 0;
      switch (unit) {
        case 's': seconds = value; break;
        case 'm': seconds = value * 60; break;
        case 'h': seconds = value * 60 * 60; break;
        case 'd': seconds = value * 24 * 60 * 60; break;
      }
      
      // Verify expiresAt is approximately now + expiresIn (with tolerance for request processing)
      const expectedMin = beforeRequest + (seconds * 1000);
      const expectedMax = afterRequest + (seconds * 1000);
      
      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax + 1000); // +1s tolerance
    });
  });
});
