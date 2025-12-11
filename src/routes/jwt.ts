import { Router, Request, Response } from 'express';
import { generateJWT, refreshJWT, getPublicKey } from '../services/jwt';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/token
 * Refresh an existing JWT
 * 
 * Request body: { token: string }
 * Response: { token: string, expiresIn: string } or error
 */
router.post('/token', async (req: Request, res: Response) => {
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
        throw error; // Re-throw unexpected errors
      }
    }
  } catch (error) {
    logger.error({ error }, 'Unexpected error during token refresh');
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
router.get('/token', async (req: Request, res: Response) => {
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
        throw error; // Re-throw unexpected errors
      }
    }
  } catch (error) {
    logger.error({ error }, 'Unexpected error during token generation');
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
router.get('/jwks', (_req: Request, res: Response) => {
  try {
    const publicKey = getPublicKey();
    
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
 * GET /.well-known/jwks.json
 * Standard JWKS endpoint (returns public key in PEM format for simplicity)
 * 
 * Response: Public key in PEM format (text/plain)
 * Note: In production, this should return proper JWK format
 */
router.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  try {
    const publicKey = getPublicKey();
    
    logger.debug('JWKS endpoint requested');
    
    // For now, return PEM format with instructions
    // In production, convert to proper JWK format
    res.setHeader('Content-Type', 'application/json');
    return res.json({
      note: 'For verification, use the public key in PEM format from /api/jwks',
      publicKeyEndpoint: '/api/jwks',
      algorithm: 'RS256',
      publicKeyPEM: publicKey,
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
