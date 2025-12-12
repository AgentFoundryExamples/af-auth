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
import { Router, Request, Response } from 'express';
import { generateJWT, refreshJWT, getPublicKeyForVerification } from '../services/jwt';
import logger from '../utils/logger';
import { jwtRateLimiter } from '../middleware/rate-limit';
import { validateBody, validateQuery, schemas } from '../middleware/validation';

const router = Router();

/**
 * POST /api/token
 * Refresh an existing JWT
 * 
 * Request body: { token: string }
 * Response: { token: string, expiresIn: string } or error
 */
router.post('/token', jwtRateLimiter, validateBody(schemas.tokenRefresh), async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token || typeof token !== 'string') {
      logger.warn('Token refresh attempted without token');
      return res.status(400).json({
        error: 'MISSING_TOKEN',
        message: 'Token is required in request body',
      });
    }
    
    try {
      const newToken = await refreshJWT(token);
      
      logger.info('Token refreshed successfully');
      
      return res.json({
        token: newToken,
        expiresIn: '30d',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'EXPIRED_TOKEN') {
        logger.debug('Token refresh failed: token expired');
        return res.status(401).json({
          error: 'EXPIRED_TOKEN',
          message: 'The provided token has expired. Please authenticate again.',
        });
      } else if (errorMessage === 'INVALID_TOKEN') {
        logger.debug('Token refresh failed: invalid token');
        return res.status(400).json({
          error: 'INVALID_TOKEN',
          message: 'The provided token is invalid or malformed.',
        });
      } else if (errorMessage === 'USER_NOT_FOUND') {
        logger.warn('Token refresh failed: user not found');
        return res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: 'User associated with this token no longer exists.',
        });
      } else if (errorMessage === 'WHITELIST_REVOKED') {
        logger.info('Token refresh denied: whitelist revoked');
        return res.status(403).json({
          error: 'WHITELIST_REVOKED',
          message: 'Your access has been revoked. Please contact the administrator.',
        });
      } else {
        // Log error message only, not the full error object to avoid exposing sensitive details
        logger.error({ errorMessage }, 'Unexpected error during token refresh');
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      }
    }
  } catch (error) {
    // Outer catch for unexpected errors in request parsing
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Unexpected error in token refresh handler');
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

/**
 * GET /api/token
 * Issue a new JWT for an authenticated user
 * 
 * Query params: userId (string)
 * Response: { token: string, expiresIn: string } or error
 */
router.get('/token', jwtRateLimiter, validateQuery(schemas.tokenIssuanceQuery), async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    
    if (!userId || typeof userId !== 'string') {
      logger.warn('Token generation attempted without userId');
      return res.status(400).json({
        error: 'MISSING_USER_ID',
        message: 'userId is required as a query parameter',
      });
    }
    
    try {
      const token = await generateJWT(userId);
      
      logger.info({ userId }, 'Token generated successfully');
      
      return res.json({
        token,
        expiresIn: '30d',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'User not found') {
        logger.warn({ userId }, 'Token generation failed: user not found');
        return res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: 'The specified user does not exist.',
        });
      } else {
        // Log error message only, not the full error object to avoid exposing sensitive details
        logger.error({ userId, errorMessage }, 'Unexpected error during token generation');
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      }
    }
  } catch (error) {
    // Log error message only, not the full error object to avoid exposing sensitive details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Unexpected error during token generation');
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
});

/**
 * GET /api/jwks
 * Get public key for JWT verification
 * 
 * Response: Public key in PEM format (text/plain)
 */
router.get('/jwks', jwtRateLimiter, (_req: Request, res: Response) => {
  try {
    const publicKey = getPublicKeyForVerification();
    
    logger.debug('Public key requested');
    
    res.setHeader('Content-Type', 'text/plain');
    return res.send(publicKey);
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve public key');
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve public key.',
    });
  }
});

/**
 * GET /jwks.json
 * Standard JWKS endpoint (returns public key in PEM format for simplicity)
 * Note: Should be mounted at /.well-known/jwks.json via app.use('/.well-known', jwtRoutes)
 * 
 * Response: Simplified JWKS with PEM key (application/json)
 * Note: This is not a fully compliant JWKS. For standard JWKS with n/e parameters,
 * convert the PEM key using a library like pem-jwk or node-jose.
 */
router.get('/jwks.json', jwtRateLimiter, (_req: Request, res: Response) => {
  try {
    const publicKey = getPublicKeyForVerification();
    
    logger.debug('JWKS endpoint requested');
    
    // Return simplified JWKS with PEM key
    // For full JWKS compliance, consumers should convert the PEM key to JWK format
    res.setHeader('Content-Type', 'application/json');
    return res.json({
      note: 'Simplified JWKS response. For JWT verification, use the public key in PEM format from the publicKeyPEM field or /api/jwks endpoint.',
      publicKeyEndpoint: '/api/jwks',
      algorithm: 'RS256',
      publicKeyPEM: publicKey,
      keys: [
        {
          kty: 'RSA',
          use: 'sig',
          alg: 'RS256',
          kid: 'default',
          // To include proper 'n' and 'e' parameters, convert PEM to JWK
          // using a library like pem-jwk or node-jose
        },
      ],
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve JWKS');
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve JWKS.',
    });
  }
});

export default router;
