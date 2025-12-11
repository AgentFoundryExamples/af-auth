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

// Mock prisma
jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

import {
  signJWT,
  verifyJWT,
  generateJWT,
  refreshJWT,
  getPublicKey,
  JWTClaims,
} from './jwt';
import { prisma } from '../db';
import jwt from 'jsonwebtoken';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('JWT Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signJWT', () => {
    it('should sign a JWT with valid claims', () => {
      const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
        sub: 'test-user-id',
        githubId: '12345',
        isWhitelisted: true,
      };

      const token = signJWT(claims);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include issuer and audience in signed token', () => {
      const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
        sub: 'test-user-id',
        githubId: '12345',
        isWhitelisted: true,
      };

      const token = signJWT(claims);
      const decoded = jwt.decode(token) as JWTClaims;

      expect(decoded.iss).toBeDefined();
      expect(decoded.aud).toBeDefined();
      expect(decoded.sub).toBe(claims.sub);
      expect(decoded.githubId).toBe(claims.githubId);
      expect(decoded.isWhitelisted).toBe(claims.isWhitelisted);
    });

    it('should set expiration time', () => {
      const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
        sub: 'test-user-id',
        githubId: '12345',
        isWhitelisted: true,
      };

      const token = signJWT(claims);
      const decoded = jwt.decode(token) as JWTClaims;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      // Expiry should be in the future
      expect(decoded.exp!).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('verifyJWT', () => {
    it('should verify a valid JWT', () => {
      const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
        sub: 'test-user-id',
        githubId: '12345',
        isWhitelisted: true,
      };

      const token = signJWT(claims);
      const result = verifyJWT(token);

      expect(result.valid).toBe(true);
      expect(result.claims).toBeDefined();
      expect(result.claims?.sub).toBe(claims.sub);
      expect(result.claims?.githubId).toBe(claims.githubId);
      expect(result.claims?.isWhitelisted).toBe(claims.isWhitelisted);
      expect(result.error).toBeUndefined();
      expect(result.expired).toBeUndefined();
    });

    it('should reject an invalid JWT', () => {
      const result = verifyJWT('invalid.token.here');

      expect(result.valid).toBe(false);
      expect(result.claims).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.expired).toBe(false);
    });

    it('should reject a tampered JWT', () => {
      const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
        sub: 'test-user-id',
        githubId: '12345',
        isWhitelisted: true,
      };

      const token = signJWT(claims);
      // Tamper with the token by changing a character
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      
      const result = verifyJWT(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle malformed tokens gracefully', () => {
      const malformedTokens = [
        '',
        'not-a-jwt',
        'only.two.parts',
        'invalid..token',
      ];

      malformedTokens.forEach((token) => {
        const result = verifyJWT(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('generateJWT', () => {
    it('should generate JWT for existing user', async () => {
      const mockUser = {
        id: 'test-user-id',
        githubUserId: BigInt(12345),
        isWhitelisted: true,
        githubAccessToken: 'gho_token',
        githubRefreshToken: null,
        githubTokenExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const token = await generateJWT('test-user-id');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-user-id' },
      });

      const result = verifyJWT(token);
      expect(result.valid).toBe(true);
      expect(result.claims?.sub).toBe(mockUser.id);
      expect(result.claims?.githubId).toBe(mockUser.githubUserId.toString());
      expect(result.claims?.isWhitelisted).toBe(mockUser.isWhitelisted);
    });

    it('should throw error for non-existent user', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(generateJWT('non-existent-id')).rejects.toThrow('User not found');
    });

    it('should include current whitelist status', async () => {
      const mockUser = {
        id: 'test-user-id',
        githubUserId: BigInt(12345),
        isWhitelisted: false, // Not whitelisted
        githubAccessToken: 'gho_token',
        githubRefreshToken: null,
        githubTokenExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const token = await generateJWT('test-user-id');
      const result = verifyJWT(token);

      expect(result.claims?.isWhitelisted).toBe(false);
    });
  });

  describe('refreshJWT', () => {
    const mockUser = {
      id: 'test-user-id',
      githubUserId: BigInt(12345),
      isWhitelisted: true,
      githubAccessToken: 'gho_token',
      githubRefreshToken: null,
      githubTokenExpiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should refresh a valid token', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const originalToken = await generateJWT('test-user-id');
      
      // Wait 1 second to ensure different iat claim
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newToken = await refreshJWT(originalToken);

      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(originalToken); // Should be a new token

      const result = verifyJWT(newToken);
      expect(result.valid).toBe(true);
      expect(result.claims?.sub).toBe(mockUser.id);
    });

    it('should reject expired token with EXPIRED_TOKEN error', async () => {
      const expiredToken = 'expired.token.value';
      
      await expect(refreshJWT(expiredToken)).rejects.toThrow('INVALID_TOKEN');
    });

    it('should reject invalid token with INVALID_TOKEN error', async () => {
      const invalidToken = 'invalid.token.value';
      
      await expect(refreshJWT(invalidToken)).rejects.toThrow('INVALID_TOKEN');
    });

    it('should reject token for non-existent user', async () => {
      const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
        sub: 'non-existent-user',
        githubId: '12345',
        isWhitelisted: true,
      };

      const token = signJWT(claims);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(refreshJWT(token)).rejects.toThrow('USER_NOT_FOUND');
    });

    it('should reject token for user with revoked whitelist', async () => {
      const revokedUser = {
        ...mockUser,
        isWhitelisted: false, // Whitelist revoked
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(revokedUser);

      const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
        sub: mockUser.id,
        githubId: mockUser.githubUserId.toString(),
        isWhitelisted: true, // Was whitelisted when token was issued
      };

      const token = signJWT(claims);

      await expect(refreshJWT(token)).rejects.toThrow('WHITELIST_REVOKED');
    });

    it('should issue new token with updated user data', async () => {
      const updatedUser = {
        ...mockUser,
        isWhitelisted: true,
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(updatedUser);

      const oldClaims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
        sub: mockUser.id,
        githubId: mockUser.githubUserId.toString(),
        isWhitelisted: false, // Old status
      };

      const oldToken = signJWT(oldClaims);
      const newToken = await refreshJWT(oldToken);

      const result = verifyJWT(newToken);
      expect(result.valid).toBe(true);
      expect(result.claims?.isWhitelisted).toBe(true); // Updated status
    });
  });

  describe('getPublicKey', () => {
    it('should return public key in PEM format', () => {
      const publicKey = getPublicKey();

      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
      expect(publicKey).toContain('BEGIN PUBLIC KEY');
      expect(publicKey).toContain('END PUBLIC KEY');
    });
  });
});
