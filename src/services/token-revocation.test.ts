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
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock JWT service
jest.mock('./jwt');

// Mock prisma
jest.mock('../db', () => ({
  prisma: {
    revokedToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  },
}));

import {
  revokeToken,
  revokeAllUserTokens,
  isTokenRevoked,
  cleanupExpiredRevokedTokens,
  getRevocationStatus,
} from './token-revocation';
import { verifyJWT } from './jwt';
import { prisma } from '../db';

const mockVerifyJWT = verifyJWT as jest.MockedFunction<typeof verifyJWT>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Token Revocation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('revokeToken', () => {
    it('should successfully revoke a valid token', async () => {
      const token = 'valid.jwt.token';
      const mockClaims = {
        sub: 'user-123',
        githubId: '12345',
        jti: 'token-jti-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: mockClaims,
      });

      (mockPrisma.revokedToken.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.revokedToken.create as jest.Mock).mockResolvedValue({
        id: 'revocation-id',
        jti: mockClaims.jti,
        userId: mockClaims.sub,
      });

      const result = await revokeToken(token, 'admin-user', 'Security incident');

      expect(result.success).toBe(true);
      expect(result.jti).toBe(mockClaims.jti);
      expect(mockPrisma.revokedToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jti: mockClaims.jti,
          userId: mockClaims.sub,
          revokedBy: 'admin-user',
          reason: 'Security incident',
        }),
      });
    });

    it('should handle already revoked token', async () => {
      const token = 'valid.jwt.token';
      const mockClaims = {
        sub: 'user-123',
        githubId: '12345',
        jti: 'token-jti-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: mockClaims,
      });

      (mockPrisma.revokedToken.findUnique as jest.Mock).mockResolvedValue({
        jti: mockClaims.jti,
        userId: mockClaims.sub,
      });

      const result = await revokeToken(token);

      expect(result.success).toBe(true);
      expect(result.jti).toBe(mockClaims.jti);
      expect(mockPrisma.revokedToken.create).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      const token = 'invalid.jwt.token';

      mockVerifyJWT.mockReturnValue({
        valid: false,
        error: 'Invalid token',
      });

      const result = await revokeToken(token);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token');
      expect(mockPrisma.revokedToken.create).not.toHaveBeenCalled();
    });

    it('should reject token without JTI', async () => {
      const token = 'valid.jwt.token';
      const mockClaims = {
        sub: 'user-123',
        githubId: '12345',
        // No JTI
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: mockClaims as any,
      });

      const result = await revokeToken(token);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token does not have JTI claim');
    });

    it('should handle database errors gracefully', async () => {
      const token = 'valid.jwt.token';
      const mockClaims = {
        sub: 'user-123',
        githubId: '12345',
        jti: 'token-jti-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: mockClaims,
      });

      (mockPrisma.revokedToken.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.revokedToken.create as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const result = await revokeToken(token);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should update user whitelist status', async () => {
      const userId = 'user-123';

      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        id: userId,
        isWhitelisted: false,
      });

      const result = await revokeAllUserTokens(userId, 'admin-user', 'Account suspended');

      expect(result.success).toBe(true);
      expect(result.message).toContain('revoked');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isWhitelisted: false },
      });
    });

    it('should handle database errors', async () => {
      const userId = 'user-123';

      (mockPrisma.user.update as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const result = await revokeAllUserTokens(userId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Database error');
    });
  });

  describe('isTokenRevoked', () => {
    it('should return true for revoked token', async () => {
      const jti = 'revoked-jti';

      (mockPrisma.revokedToken.findUnique as jest.Mock).mockResolvedValue({
        jti,
        userId: 'user-123',
      });

      const result = await isTokenRevoked(jti);

      expect(result).toBe(true);
      expect(mockPrisma.revokedToken.findUnique).toHaveBeenCalledWith({
        where: { jti },
      });
    });

    it('should return false for non-revoked token', async () => {
      const jti = 'valid-jti';

      (mockPrisma.revokedToken.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await isTokenRevoked(jti);

      expect(result).toBe(false);
    });
  });

  describe('cleanupExpiredRevokedTokens', () => {
    it('should delete expired revoked tokens', async () => {
      (mockPrisma.revokedToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 42,
      });

      const result = await cleanupExpiredRevokedTokens(7, false);

      expect(result).toBe(42);
      expect(mockPrisma.revokedToken.deleteMany).toHaveBeenCalledWith({
        where: {
          tokenExpiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should use default retention period', async () => {
      (mockPrisma.revokedToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 10,
      });

      const result = await cleanupExpiredRevokedTokens();

      expect(result).toBe(10);
    });

    it('should count tokens in dry run mode', async () => {
      (mockPrisma.revokedToken.count as jest.Mock).mockResolvedValue(25);

      const result = await cleanupExpiredRevokedTokens(7, true);

      expect(result).toBe(25);
      expect(mockPrisma.revokedToken.count).toHaveBeenCalledWith({
        where: {
          tokenExpiresAt: {
            lt: expect.any(Date),
          },
        },
      });
      expect(mockPrisma.revokedToken.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getRevocationStatus', () => {
    it('should return revocation details for revoked token', async () => {
      const jti = 'revoked-jti';
      const mockRevocation = {
        jti,
        userId: 'user-123',
        revokedAt: new Date(),
        revokedBy: 'admin-user',
        reason: 'Security incident',
        tokenExpiresAt: new Date(),
      };

      (mockPrisma.revokedToken.findUnique as jest.Mock).mockResolvedValue(mockRevocation);

      const result = await getRevocationStatus(jti);

      expect(result).toEqual(mockRevocation);
    });

    it('should return null for non-revoked token', async () => {
      const jti = 'valid-jti';

      (mockPrisma.revokedToken.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getRevocationStatus(jti);

      expect(result).toBeNull();
    });
  });
});
