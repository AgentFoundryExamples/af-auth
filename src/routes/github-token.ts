import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { prisma } from '../db';
import { authenticateService, logServiceAccess } from '../services/service-registry';

const router = Router();

/**
 * Extract service credentials from request headers
 */
function extractServiceCredentials(req: Request): {
  serviceIdentifier: string | null;
  apiKey: string | null;
} {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return { serviceIdentifier: null, apiKey: null };
  }
  
  // Support Bearer token format: "Bearer <serviceIdentifier>:<apiKey>"
  // or Basic auth format: "Basic <base64(serviceIdentifier:apiKey)>"
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const parts = token.split(':');
    if (parts.length === 2) {
      return { serviceIdentifier: parts[0], apiKey: parts[1] };
    }
  } else if (authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const parts = credentials.split(':');
    if (parts.length === 2) {
      return { serviceIdentifier: parts[0], apiKey: parts[1] };
    }
  }
  
  return { serviceIdentifier: null, apiKey: null };
}

/**
 * POST /api/github-token
 * Retrieve a user's GitHub access token for authorized services
 * 
 * NOTE: This endpoint does not implement rate limiting. For production deployments,
 * consider implementing rate limiting per service (e.g., 1000 requests/hour) to prevent
 * abuse. See docs/service-registry.md for recommendations.
 * 
 * Request headers:
 * - Authorization: Bearer <serviceIdentifier>:<apiKey> or Basic <base64(serviceIdentifier:apiKey)>
 * 
 * Request body:
 * - userId: UUID of the user (optional, use this OR githubUserId)
 * - githubUserId: GitHub user ID (optional, use this OR userId)
 * 
 * Response:
 * - token: GitHub access token
 * - expiresAt: Token expiration timestamp (ISO 8601)
 * - user: User information (id, githubUserId, isWhitelisted)
 */
router.post('/github-token', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Extract service credentials
    const { serviceIdentifier, apiKey } = extractServiceCredentials(req);
    
    if (!serviceIdentifier || !apiKey) {
      logger.warn('GitHub token request missing service credentials');
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid service credentials. Use Authorization header with Bearer or Basic auth.',
      });
    }
    
    // Authenticate service
    const authResult = await authenticateService(serviceIdentifier, apiKey);
    
    if (!authResult.authenticated || !authResult.service) {
      logger.warn({ serviceIdentifier }, 'GitHub token request with invalid credentials');
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: authResult.error || 'Invalid service credentials',
      });
    }
    
    const service = authResult.service;
    
    // Extract user identifier from request body
    const { userId, githubUserId } = req.body;
    
    if (!userId && !githubUserId) {
      logger.warn({ serviceId: service.id }, 'GitHub token request missing user identifier');
      
      // Log failed attempt (use placeholder for userId since we don't have one)
      await logServiceAccess(
        service.id,
        'unknown',
        'retrieve_github_token',
        false,
        {
          errorMessage: 'Missing user identifier',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );
      
      return res.status(400).json({
        error: 'MISSING_USER_IDENTIFIER',
        message: 'Either userId or githubUserId is required in request body',
      });
    }
    
    // Find user
    let user;
    if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
      });
    } else if (githubUserId) {
      // Convert to BigInt for database query
      const githubUserIdBigInt = BigInt(githubUserId);
      user = await prisma.user.findUnique({
        where: { githubUserId: githubUserIdBigInt },
      });
    }
    
    if (!user) {
      logger.warn(
        { serviceId: service.id, userId, githubUserId },
        'GitHub token request for non-existent user'
      );
      
      // Log failed attempt
      await logServiceAccess(
        service.id,
        userId || `github:${githubUserId}`,
        'retrieve_github_token',
        false,
        {
          errorMessage: 'User not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );
      
      return res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'The specified user does not exist',
      });
    }
    
    // Check if user is whitelisted
    if (!user.isWhitelisted) {
      logger.warn(
        { serviceId: service.id, userId: user.id },
        'GitHub token request for non-whitelisted user'
      );
      
      // Log failed attempt
      await logServiceAccess(
        service.id,
        user.id,
        'retrieve_github_token',
        false,
        {
          errorMessage: 'User not whitelisted',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );
      
      return res.status(403).json({
        error: 'USER_NOT_WHITELISTED',
        message: 'The specified user is not whitelisted for access',
      });
    }
    
    // Check if user has a GitHub access token
    if (!user.githubAccessToken) {
      logger.warn(
        { serviceId: service.id, userId: user.id },
        'GitHub token request for user without token'
      );
      
      // Log failed attempt
      await logServiceAccess(
        service.id,
        user.id,
        'retrieve_github_token',
        false,
        {
          errorMessage: 'No GitHub token available',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );
      
      return res.status(404).json({
        error: 'TOKEN_NOT_AVAILABLE',
        message: 'GitHub access token not available for this user',
      });
    }
    
    // Log successful access
    await logServiceAccess(
      service.id,
      user.id,
      'retrieve_github_token',
      true,
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );
    
    const duration = Date.now() - startTime;
    logger.info(
      { serviceId: service.id, userId: user.id, duration },
      'GitHub token retrieved successfully'
    );
    
    // Return token and metadata
    return res.json({
      token: user.githubAccessToken,
      expiresAt: user.githubTokenExpiresAt?.toISOString() || null,
      user: {
        id: user.id,
        githubUserId: user.githubUserId.toString(),
        isWhitelisted: user.isWhitelisted,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Unexpected error in GitHub token endpoint');
    
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

export default router;
