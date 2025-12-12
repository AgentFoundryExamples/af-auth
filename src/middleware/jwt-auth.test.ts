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
jest.mock('../services/jwt');

// Mock token revocation service
jest.mock('../services/token-revocation');

// Mock prisma
jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

import { Request, Response } from 'express';
import { verifyJWTMiddleware, verifyJWTWithoutWhitelistCheck } from './jwt-auth';
import { verifyJWT } from '../services/jwt';
import { isTokenRevoked } from '../services/token-revocation';
import { prisma } from '../db';

const mockVerifyJWT = verifyJWT as jest.MockedFunction<typeof verifyJWT>;
const mockIsTokenRevoked = isTokenRevoked as jest.MockedFunction<typeof isTokenRevoked>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('JWT Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('verifyJWTMiddleware', () => {
    it('should reject request without authorization header', async () => {
      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject request with invalid authorization format', async () => {
      mockRequest.headers = { authorization: 'InvalidFormat token' };

      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
      mockRequest.headers = { authorization: 'Bearer expired.token' };

      mockVerifyJWT.mockReturnValue({
        valid: false,
        expired: true,
        error: 'Token expired',
      });

      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'EXPIRED_TOKEN',
        message: 'Token has expired',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid.token' };

      mockVerifyJWT.mockReturnValue({
        valid: false,
        expired: false,
        error: 'Invalid signature',
      });

      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INVALID_TOKEN',
        message: 'Invalid token',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject revoked token', async () => {
      mockRequest.headers = { authorization: 'Bearer revoked.token' };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: {
          sub: 'user-123',
          githubId: '12345',
          jti: 'revoked-jti',
        },
      });

      mockIsTokenRevoked.mockResolvedValue(true);

      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'TOKEN_REVOKED',
        message: 'This token has been revoked',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject token for non-existent user', async () => {
      mockRequest.headers = { authorization: 'Bearer valid.token' };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: {
          sub: 'user-123',
          githubId: '12345',
          jti: 'valid-jti',
        },
      });

      mockIsTokenRevoked.mockResolvedValue(false);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject token for non-whitelisted user', async () => {
      mockRequest.headers = { authorization: 'Bearer valid.token' };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: {
          sub: 'user-123',
          githubId: '12345',
          jti: 'valid-jti',
        },
      });

      mockIsTokenRevoked.mockResolvedValue(false);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        isWhitelisted: false,
      });

      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'WHITELIST_REVOKED',
        message: 'Access has been revoked',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should accept valid token for whitelisted user', async () => {
      mockRequest.headers = { authorization: 'Bearer valid.token' };

      const mockClaims = {
        sub: 'user-123',
        githubId: '12345',
        jti: 'valid-jti',
      };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: mockClaims,
      });

      mockIsTokenRevoked.mockResolvedValue(false);
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        isWhitelisted: true,
      });

      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect((mockRequest as any).user).toEqual(mockClaims);
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockRequest.headers = { authorization: 'Bearer valid.token' };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: {
          sub: 'user-123',
          githubId: '12345',
          jti: 'valid-jti',
        },
      });

      mockIsTokenRevoked.mockRejectedValue(new Error('Database error'));

      await verifyJWTMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INTERNAL_ERROR',
        message: 'Authentication error',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('verifyJWTWithoutWhitelistCheck', () => {
    it('should accept valid non-revoked token without checking whitelist', async () => {
      mockRequest.headers = { authorization: 'Bearer valid.token' };

      const mockClaims = {
        sub: 'user-123',
        githubId: '12345',
        jti: 'valid-jti',
      };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: mockClaims,
      });

      mockIsTokenRevoked.mockResolvedValue(false);

      await verifyJWTWithoutWhitelistCheck(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect((mockRequest as any).user).toEqual(mockClaims);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should still reject revoked tokens', async () => {
      mockRequest.headers = { authorization: 'Bearer revoked.token' };

      mockVerifyJWT.mockReturnValue({
        valid: true,
        claims: {
          sub: 'user-123',
          githubId: '12345',
          jti: 'revoked-jti',
        },
      });

      mockIsTokenRevoked.mockResolvedValue(true);

      await verifyJWTWithoutWhitelistCheck(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'TOKEN_REVOKED',
        message: 'This token has been revoked',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });
});
