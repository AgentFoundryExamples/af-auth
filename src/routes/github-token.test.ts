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

// Mock the service registry
jest.mock('../services/service-registry');

// Mock the github-oauth service
jest.mock('../services/github-oauth');

// Mock encryption utilities
jest.mock('../utils/encryption', () => ({
  encryptGitHubToken: jest.fn(async (token) => {
    if (token === null) return null;
    return `encrypted_${token}`;
  }),
  decryptGitHubToken: jest.fn(async (token) => {
    if (token === null) return null;
    if (typeof token === 'string' && token.startsWith('encrypted_')) {
      return token.replace('encrypted_', '');
    }
    return token;
  }),
}));

// Mock the database
jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => {
      // Execute the transaction callback with the mocked prisma client
      return callback({
        user: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      });
    }),
  },
}));

import request from 'supertest';
import { app } from '../server';
import { prisma } from '../db';
import * as serviceRegistry from '../services/service-registry';
import * as githubOAuth from '../services/github-oauth';

const mockServiceRegistry = serviceRegistry as jest.Mocked<typeof serviceRegistry>;
const mockGitHubOAuth = githubOAuth as jest.Mocked<typeof githubOAuth>;

describe('GitHub Token Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/github-token', () => {
    const validServiceAuth = 'Bearer test-service:test-api-key';

    describe('Authentication', () => {
      it('should reject request without authorization header', async () => {
        const response = await request(app)
          .post('/api/github-token')
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(401);

        expect(response.body.error).toBe('UNAUTHORIZED');
        expect(response.body.message).toContain('Missing or invalid service credentials');
      });

      it('should reject request with invalid authorization format', async () => {
        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', 'InvalidFormat')
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(401);

        expect(response.body.error).toBe('UNAUTHORIZED');
      });

      it('should authenticate with Bearer token format', async () => {
        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: true,
          service: {
            id: 'service-id',
            serviceIdentifier: 'test-service',
            allowedScopes: [],
            isActive: true,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          },
        });

        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: 'ghu_test_token',
          githubRefreshToken: null,
          githubTokenExpiresAt: new Date('2025-01-15T12:00:00.000Z'),
          isWhitelisted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockServiceRegistry.logServiceAccess.mockResolvedValue();

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(200);

        expect(mockServiceRegistry.authenticateService).toHaveBeenCalledWith(
          'test-service',
          'test-api-key'
        );
        expect(response.body.token).toBe('ghu_test_token');
      });

      it('should authenticate with Basic auth format', async () => {
        // Base64 encode "test-service:test-api-key"
        const credentials = Buffer.from('test-service:test-api-key').toString('base64');

        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: true,
          service: {
            id: 'service-id',
            serviceIdentifier: 'test-service',
            allowedScopes: [],
            isActive: true,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          },
        });

        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: 'ghu_test_token',
          githubRefreshToken: null,
          githubTokenExpiresAt: new Date('2025-01-15T12:00:00.000Z'),
          isWhitelisted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockServiceRegistry.logServiceAccess.mockResolvedValue();

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', `Basic ${credentials}`)
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(200);

        expect(mockServiceRegistry.authenticateService).toHaveBeenCalledWith(
          'test-service',
          'test-api-key'
        );
        expect(response.body.token).toBe('ghu_test_token');
      });

      it('should reject request with invalid service credentials', async () => {
        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: false,
          error: 'Invalid API key',
        });

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(401);

        expect(response.body.error).toBe('UNAUTHORIZED');
        expect(response.body.message).toBe('Invalid API key');
      });
    });

    describe('User Identification', () => {
      beforeEach(() => {
        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: true,
          service: {
            id: 'service-id',
            serviceIdentifier: 'test-service',
            allowedScopes: [],
            isActive: true,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          },
        });
        mockServiceRegistry.logServiceAccess.mockResolvedValue();
      });

      it('should reject request without user identifier', async () => {
        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({})
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(response.body).toHaveProperty('requestId');
      });
      });

      it('should find user by userId', async () => {
        const mockUser = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: 'ghu_test_token',
          githubRefreshToken: null,
          githubTokenExpiresAt: new Date('2025-01-15T12:00:00.000Z'),
          isWhitelisted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(200);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: '550e8400-e29b-41d4-a716-446655440000' },
        });
        expect(response.body.user.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      });

      it('should find user by githubUserId', async () => {
        const mockUser = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: 'ghu_test_token',
          githubRefreshToken: null,
          githubTokenExpiresAt: new Date('2025-01-15T12:00:00.000Z'),
          isWhitelisted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ githubUserId: '12345678' })
          .expect(200);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({
          where: { githubUserId: BigInt(12345678) },
        });
        expect(response.body.user.githubUserId).toBe('12345678');
      });

      it('should return 404 for non-existent user', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '123e4567-e89b-12d3-a456-426614174000' })
          .expect(404);

        expect(response.body.error).toBe('USER_NOT_FOUND');
        expect(mockServiceRegistry.logServiceAccess).toHaveBeenCalledWith(
          'service-id',
          '123e4567-e89b-12d3-a456-426614174000',
          'retrieve_github_token',
          false,
          expect.objectContaining({
            errorMessage: 'User not found',
          })
        );
      });
    });

    describe('Whitelist Validation', () => {
      beforeEach(() => {
        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: true,
          service: {
            id: 'service-id',
            serviceIdentifier: 'test-service',
            allowedScopes: [],
            isActive: true,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          },
        });
        mockServiceRegistry.logServiceAccess.mockResolvedValue();
      });

      it('should reject request for non-whitelisted user', async () => {
        const mockUser = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: 'ghu_test_token',
          githubRefreshToken: null,
          githubTokenExpiresAt: new Date('2025-01-15T12:00:00.000Z'),
          isWhitelisted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(403);

        expect(response.body.error).toBe('USER_NOT_WHITELISTED');
        expect(mockServiceRegistry.logServiceAccess).toHaveBeenCalledWith(
          'service-id',
          '550e8400-e29b-41d4-a716-446655440000',
          'retrieve_github_token',
          false,
          expect.objectContaining({
            errorMessage: 'User not whitelisted',
          })
        );
      });
    });

    describe('Token Availability', () => {
      beforeEach(() => {
        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: true,
          service: {
            id: 'service-id',
            serviceIdentifier: 'test-service',
            allowedScopes: [],
            isActive: true,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          },
        });
        mockServiceRegistry.logServiceAccess.mockResolvedValue();
      });

      it('should reject request for user without GitHub token', async () => {
        const mockUser = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: null,
          githubRefreshToken: null,
          githubTokenExpiresAt: null,
          isWhitelisted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(404);

        expect(response.body.error).toBe('TOKEN_NOT_AVAILABLE');
        expect(mockServiceRegistry.logServiceAccess).toHaveBeenCalledWith(
          'service-id',
          '550e8400-e29b-41d4-a716-446655440000',
          'retrieve_github_token',
          false,
          expect.objectContaining({
            errorMessage: 'No GitHub token available',
          })
        );
      });
    });

    describe('Success Cases', () => {
      beforeEach(() => {
        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: true,
          service: {
            id: 'service-id',
            serviceIdentifier: 'test-service',
            allowedScopes: [],
            isActive: true,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          },
        });
        mockServiceRegistry.logServiceAccess.mockResolvedValue();
      });

      it('should return GitHub token for whitelisted user', async () => {
        const expiresAt = new Date('2025-01-15T12:00:00.000Z');
        const mockUser = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: 'ghu_test_token_abc123',
          githubRefreshToken: null,
          githubTokenExpiresAt: expiresAt,
          isWhitelisted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .set('User-Agent', 'Test/1.0')
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(200);

        expect(response.body.token).toBe('ghu_test_token_abc123');
        expect(response.body.expiresAt).toBe(expiresAt.toISOString());
        expect(response.body.user).toEqual({
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: '12345678',
          isWhitelisted: true,
        });

        expect(mockServiceRegistry.logServiceAccess).toHaveBeenCalledWith(
          'service-id',
          '550e8400-e29b-41d4-a716-446655440000',
          'retrieve_github_token',
          true,
          {
            ipAddress: expect.any(String),
            userAgent: 'Test/1.0',
          }
        );
      });

      it('should return null expiresAt if token has no expiration', async () => {
        const mockUser = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: 'ghu_test_token',
          githubRefreshToken: null,
          githubTokenExpiresAt: null,
          isWhitelisted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(200);

        expect(response.body.expiresAt).toBeNull();
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: true,
          service: {
            id: 'service-id',
            serviceIdentifier: 'test-service',
            allowedScopes: [],
            isActive: true,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          },
        });
        mockServiceRegistry.logServiceAccess.mockResolvedValue();
      });

      it('should handle database errors gracefully', async () => {
        (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(500);

        expect(response.body.error).toBe('INTERNAL_ERROR');
      });
    });

    describe('Audit Logging', () => {
      beforeEach(() => {
        mockServiceRegistry.authenticateService.mockResolvedValue({
          authenticated: true,
          service: {
            id: 'service-id',
            serviceIdentifier: 'test-service',
            allowedScopes: [],
            isActive: true,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
          },
        });
        mockServiceRegistry.logServiceAccess.mockResolvedValue();
      });

      it('should log successful access with IP and user agent', async () => {
        const mockUser = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          githubUserId: BigInt(12345678),
          githubAccessToken: 'ghu_test_token',
          githubRefreshToken: null,
          githubTokenExpiresAt: null,
          isWhitelisted: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .set('User-Agent', 'Test/1.0')
          .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
          .expect(200);

        expect(mockServiceRegistry.logServiceAccess).toHaveBeenCalledWith(
          'service-id',
          '550e8400-e29b-41d4-a716-446655440000',
          'retrieve_github_token',
          true,
          {
            ipAddress: expect.any(String),
            userAgent: 'Test/1.0',
          }
        );
      });

      it('should log failed access attempts', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

        await request(app)
          .post('/api/github-token')
          .set('Authorization', validServiceAuth)
          .send({ userId: '123e4567-e89b-12d3-a456-426614174000' })
          .expect(404);

        expect(mockServiceRegistry.logServiceAccess).toHaveBeenCalledWith(
          'service-id',
          '123e4567-e89b-12d3-a456-426614174000',
          'retrieve_github_token',
          false,
          expect.objectContaining({
            errorMessage: 'User not found',
          })
        );
      });
    });
  });

  describe('Token Refresh', () => {
    beforeEach(() => {
      mockServiceRegistry.authenticateService.mockResolvedValue({
        authenticated: true,
        service: {
          id: 'service-id',
          serviceIdentifier: 'test-service',
          allowedScopes: [],
          isActive: true,
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: null,
        },
      });
      mockServiceRegistry.logServiceAccess.mockResolvedValue();
    });

    it('should refresh token when expiring soon', async () => {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // Expires in 30 minutes
      const mockUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        githubUserId: BigInt(12345678),
        githubAccessToken: 'encrypted_old_token',
        githubRefreshToken: 'encrypted_refresh_token',
        githubTokenExpiresAt: expiresAt,
        isWhitelisted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser = {
        ...mockUser,
        githubAccessToken: 'encrypted_new_token',
        githubRefreshToken: 'encrypted_new_refresh_token',
        githubTokenExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockGitHubOAuth.isTokenExpiringSoon.mockReturnValue(true);
      mockGitHubOAuth.refreshAccessToken.mockResolvedValue({
        access_token: 'new_access_token',
        token_type: 'bearer',
        scope: 'user:email',
        refresh_token: 'new_refresh_token',
        expires_in: 28800, // 8 hours
      });
      mockGitHubOAuth.calculateTokenExpiration.mockReturnValue(
        new Date(Date.now() + 8 * 60 * 60 * 1000)
      );

      // Mock the transaction to execute the callback with mock transaction client
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const txMockUser = {
          ...mockUser,
          githubAccessToken: 'encrypted_old_token',
          githubRefreshToken: 'encrypted_refresh_token',
          githubTokenExpiresAt: expiresAt,
        };
        
        const txClient = {
          user: {
            findUnique: jest.fn().mockResolvedValue(txMockUser),
            update: jest.fn().mockResolvedValue(updatedUser),
          },
        };
        
        return callback(txClient);
      });

      const response = await request(app)
        .post('/api/github-token')
        .set('Authorization', 'Bearer test-service:test-api-key')
        .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(200);

      expect(mockGitHubOAuth.isTokenExpiringSoon).toHaveBeenCalled();
      expect(mockGitHubOAuth.refreshAccessToken).toHaveBeenCalled();
      expect(response.body.token).toBeDefined();
    });

    it('should not refresh token when not expiring soon', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Expires in 24 hours
      const mockUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        githubUserId: BigInt(12345678),
        githubAccessToken: 'encrypted_token',
        githubRefreshToken: 'encrypted_refresh_token',
        githubTokenExpiresAt: expiresAt,
        isWhitelisted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockGitHubOAuth.isTokenExpiringSoon.mockReturnValue(false);

      const response = await request(app)
        .post('/api/github-token')
        .set('Authorization', 'Bearer test-service:test-api-key')
        .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(200);

      expect(mockGitHubOAuth.isTokenExpiringSoon).toHaveBeenCalled();
      expect(mockGitHubOAuth.refreshAccessToken).not.toHaveBeenCalled();
      expect(response.body.token).toBeDefined();
    });

    it('should handle refresh failure gracefully and return existing token if not expired', async () => {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // Expires in 30 minutes
      const mockUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        githubUserId: BigInt(12345678),
        githubAccessToken: 'encrypted_token',
        githubRefreshToken: 'encrypted_refresh_token',
        githubTokenExpiresAt: expiresAt,
        isWhitelisted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockGitHubOAuth.isTokenExpiringSoon.mockReturnValue(true);
      
      // Mock the transaction to throw an error simulating refresh failure
      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('GitHub API error'));

      const response = await request(app)
        .post('/api/github-token')
        .set('Authorization', 'Bearer test-service:test-api-key')
        .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(200);

      expect(response.body.token).toBeDefined();
    });

    it('should return error when refresh fails and token is already expired', async () => {
      const expiresAt = new Date(Date.now() - 60 * 1000); // Expired 1 minute ago
      const mockUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        githubUserId: BigInt(12345678),
        githubAccessToken: 'encrypted_token',
        githubRefreshToken: 'encrypted_refresh_token',
        githubTokenExpiresAt: expiresAt,
        isWhitelisted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockGitHubOAuth.isTokenExpiringSoon.mockReturnValue(true);
      mockGitHubOAuth.refreshAccessToken.mockRejectedValue(new Error('GitHub API error'));

      const response = await request(app)
        .post('/api/github-token')
        .set('Authorization', 'Bearer test-service:test-api-key')
        .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(503);

      expect(response.body.error).toBe('TOKEN_REFRESH_FAILED');
    });

    it('should not attempt refresh when no refresh token available', async () => {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // Expires in 30 minutes
      const mockUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        githubUserId: BigInt(12345678),
        githubAccessToken: 'encrypted_token',
        githubRefreshToken: null, // No refresh token
        githubTokenExpiresAt: expiresAt,
        isWhitelisted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockGitHubOAuth.isTokenExpiringSoon.mockReturnValue(true);

      const response = await request(app)
        .post('/api/github-token')
        .set('Authorization', 'Bearer test-service:test-api-key')
        .send({ userId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(200);

      expect(mockGitHubOAuth.refreshAccessToken).not.toHaveBeenCalled();
      expect(response.body.token).toBeDefined();
    });
  });
});
