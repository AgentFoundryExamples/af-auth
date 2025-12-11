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

      expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
      expect(response.body).toHaveProperty('message');
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

      expect(response.body).toHaveProperty('error', 'MISSING_TOKEN');
    });
  });

  describe('GET /api/token', () => {
    it('should generate token for valid user', async () => {
      const userId = 'test-user-id';
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

      expect(response.body).toHaveProperty('error', 'MISSING_USER_ID');
    });

    it('should handle non-existent user', async () => {
      const userId = 'non-existent-user';

      mockJwtService.generateJWT.mockRejectedValue(new Error('User not found'));

      const response = await request(app)
        .get('/api/token')
        .query({ userId })
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'USER_NOT_FOUND');
    });

    it('should handle unexpected errors', async () => {
      const userId = 'test-user-id';

      mockJwtService.generateJWT.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/token')
        .query({ userId })
        .expect(500)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'INTERNAL_ERROR');
    });

    it('should reject non-string userId', async () => {
      // When userId is a number, it's converted to string in query params
      // so we need to test with something that truly won't work
      const response = await request(app)
        .get('/api/token')
        .query({ userId: '' }) // Empty string
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'MISSING_USER_ID');
    });
  });

  describe('GET /api/jwks', () => {
    it('should return public key in PEM format', async () => {
      const publicKey = '-----BEGIN PUBLIC KEY-----\ntest-key\n-----END PUBLIC KEY-----';

      mockJwtService.getPublicKey.mockReturnValue(publicKey);

      const response = await request(app)
        .get('/api/jwks')
        .expect(200)
        .expect('Content-Type', 'text/plain; charset=utf-8');

      expect(response.text).toBe(publicKey);
      expect(response.text).toContain('BEGIN PUBLIC KEY');
      expect(mockJwtService.getPublicKey).toHaveBeenCalled();
    });

    it('should handle errors when retrieving public key', async () => {
      mockJwtService.getPublicKey.mockImplementation(() => {
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

      mockJwtService.getPublicKey.mockReturnValue(publicKey);

      const response = await request(app)
        .get('/.well-known/jwks.json')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('publicKeyEndpoint', '/api/jwks');
      expect(response.body).toHaveProperty('algorithm', 'RS256');
      expect(response.body).toHaveProperty('publicKeyPEM', publicKey);
      expect(response.body).toHaveProperty('keys');
      expect(Array.isArray(response.body.keys)).toBe(true);
      expect(mockJwtService.getPublicKey).toHaveBeenCalled();
    });

    it('should handle errors when retrieving JWKS', async () => {
      mockJwtService.getPublicKey.mockImplementation(() => {
        throw new Error('Key file not found');
      });

      const response = await request(app)
        .get('/.well-known/jwks.json')
        .expect(500)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('error', 'INTERNAL_ERROR');
    });
  });
});
