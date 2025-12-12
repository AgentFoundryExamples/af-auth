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
import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../services/jwt';
import { isTokenRevoked } from '../services/token-revocation';
import { prisma } from '../db';
import logger from '../utils/logger';
import { recordAuthFailure } from '../services/metrics';

/**
 * Extended Request interface with JWT claims
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    githubId: string;
    jti: string;
  };
}

/**
 * Middleware to verify JWT and check revocation status
 * Attaches decoded claims to req.user if valid
 */
export async function verifyJWTMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      recordAuthFailure('jwt', 'missing_auth_header');
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      });
      return;
    }
    
    const token = authHeader.substring(7);
    
    // Verify token signature and expiry
    const verifyResult = verifyJWT(token);
    
    if (!verifyResult.valid) {
      if (verifyResult.expired) {
        logger.debug('JWT verification failed: token expired');
        recordAuthFailure('jwt', 'token_expired');
        res.status(401).json({
          error: 'EXPIRED_TOKEN',
          message: 'Token has expired',
        });
        return;
      }
      
      logger.debug('JWT verification failed: invalid token');
      recordAuthFailure('jwt', 'invalid_token');
      res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid token',
      });
      return;
    }
    
    const { claims } = verifyResult;
    if (!claims) {
      recordAuthFailure('jwt', 'invalid_claims');
      res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid token claims',
      });
      return;
    }
    
    // Check if token is revoked
    if (claims.jti) {
      const revoked = await isTokenRevoked(claims.jti);
      if (revoked) {
        logger.info({ jti: claims.jti, userId: claims.sub }, 'Revoked token rejected');
        recordAuthFailure('jwt', 'token_revoked');
        res.status(401).json({
          error: 'TOKEN_REVOKED',
          message: 'This token has been revoked',
        });
        return;
      }
    }
    
    // Check user whitelist status from database
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { isWhitelisted: true },
    });
    
    if (!user) {
      logger.warn({ userId: claims.sub }, 'Token rejected: user not found');
      recordAuthFailure('jwt', 'user_not_found');
      res.status(404).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
      return;
    }
    
    if (!user.isWhitelisted) {
      logger.info({ userId: claims.sub }, 'Token rejected: user not whitelisted');
      recordAuthFailure('whitelist', 'whitelist_revoked');
      res.status(403).json({
        error: 'WHITELIST_REVOKED',
        message: 'Access has been revoked',
      });
      return;
    }
    
    // Attach user info to request
    (req as AuthenticatedRequest).user = {
      sub: claims.sub,
      githubId: claims.githubId,
      jti: claims.jti,
    };
    
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Error in JWT verification middleware');
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Authentication error',
    });
  }
}

/**
 * Middleware to verify JWT without checking whitelist status
 * Useful for endpoints that need authentication but not authorization
 */
export async function verifyJWTWithoutWhitelistCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      });
      return;
    }
    
    const token = authHeader.substring(7);
    
    // Verify token signature and expiry
    const verifyResult = verifyJWT(token);
    
    if (!verifyResult.valid) {
      if (verifyResult.expired) {
        res.status(401).json({
          error: 'EXPIRED_TOKEN',
          message: 'Token has expired',
        });
        return;
      }
      
      res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid token',
      });
      return;
    }
    
    const { claims } = verifyResult;
    if (!claims) {
      res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid token claims',
      });
      return;
    }
    
    // Check if token is revoked
    if (claims.jti) {
      const revoked = await isTokenRevoked(claims.jti);
      if (revoked) {
        logger.info({ jti: claims.jti, userId: claims.sub }, 'Revoked token rejected');
        res.status(401).json({
          error: 'TOKEN_REVOKED',
          message: 'This token has been revoked',
        });
        return;
      }
    }
    
    // Attach user info to request
    (req as AuthenticatedRequest).user = {
      sub: claims.sub,
      githubId: claims.githubId,
      jti: claims.jti,
    };
    
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Error in JWT verification middleware');
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Authentication error',
    });
  }
}
