import jwt from 'jsonwebtoken';
import fs from 'fs';
import { config } from '../config';
import logger from '../utils/logger';
import { prisma } from '../db';

/**
 * JWT Claims structure
 */
export interface JWTClaims {
  sub: string; // Internal user UUID
  githubId: string; // GitHub user ID
  isWhitelisted: boolean; // Whitelist status at time of issuance
  iat?: number; // Issued at (automatically added by jsonwebtoken)
  exp?: number; // Expiration (automatically added by jsonwebtoken)
  iss?: string; // Issuer
  aud?: string; // Audience
}

/**
 * JWT verification result
 */
export interface JWTVerifyResult {
  valid: boolean;
  claims?: JWTClaims;
  error?: string;
  expired?: boolean;
}

/**
 * Load RSA private key from file
 */
function loadPrivateKey(): string {
  try {
    return fs.readFileSync(config.jwt.privateKeyPath, 'utf8');
  } catch (error) {
    logger.error(
      { error, path: config.jwt.privateKeyPath },
      'Failed to load JWT private key'
    );
    throw new Error('JWT private key not found. Please generate keys using openssl.');
  }
}

/**
 * Load RSA public key from file
 */
function loadPublicKey(): string {
  try {
    return fs.readFileSync(config.jwt.publicKeyPath, 'utf8');
  } catch (error) {
    logger.error(
      { error, path: config.jwt.publicKeyPath },
      'Failed to load JWT public key'
    );
    throw new Error('JWT public key not found. Please generate keys using openssl.');
  }
}

/**
 * Sign a JWT with the provided claims
 * Uses RS256 algorithm with private key
 */
export function signJWT(claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  const privateKey = loadPrivateKey();
  
  const payload: Omit<JWTClaims, 'iat' | 'exp'> = {
    ...claims,
    iss: config.jwt.issuer,
    aud: config.jwt.audience,
  };
  
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.expiresIn,
  });
  
  logger.debug(
    { sub: claims.sub, expiresIn: config.jwt.expiresIn },
    'JWT signed successfully'
  );
  
  return token;
}

/**
 * Verify a JWT and return the claims
 * Uses RS256 algorithm with public key
 */
export function verifyJWT(token: string): JWTVerifyResult {
  try {
    const publicKey = loadPublicKey();
    
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      clockTolerance: config.jwt.clockTolerance,
    }) as JWTClaims;
    
    logger.debug({ sub: decoded.sub }, 'JWT verified successfully');
    
    return {
      valid: true,
      claims: decoded,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('JWT verification failed: token expired');
      return {
        valid: false,
        error: 'Token has expired',
        expired: true,
      };
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.debug({ error: error.message }, 'JWT verification failed: invalid token');
      return {
        valid: false,
        error: error.message,
        expired: false,
      };
    } else {
      logger.error({ error }, 'Unexpected error during JWT verification');
      return {
        valid: false,
        error: 'Invalid token',
        expired: false,
      };
    }
  }
}

/**
 * Generate a fresh JWT for a user
 * Fetches current user data from database to ensure up-to-date claims
 */
export async function generateJWT(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
    sub: user.id,
    githubId: user.githubUserId.toString(),
    isWhitelisted: user.isWhitelisted,
  };
  
  return signJWT(claims);
}

/**
 * Refresh a JWT by validating the old token and issuing a new one
 * Validates:
 * - Token signature and expiry
 * - User still exists in database
 * - User is still whitelisted
 * 
 * Returns a new JWT if validation passes, throws error otherwise
 */
export async function refreshJWT(token: string): Promise<string> {
  // Verify the token
  const verifyResult = verifyJWT(token);
  
  if (!verifyResult.valid) {
    if (verifyResult.expired) {
      throw new Error('EXPIRED_TOKEN');
    }
    throw new Error('INVALID_TOKEN');
  }
  
  const { claims } = verifyResult;
  if (!claims) {
    throw new Error('INVALID_TOKEN');
  }
  
  // Fetch current user data
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
  });
  
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  
  // Check whitelist status
  if (!user.isWhitelisted) {
    throw new Error('WHITELIST_REVOKED');
  }
  
  // Generate and return new JWT with current user data
  return generateJWT(user.id);
}

/**
 * Get public key in PEM format for external verification
 */
export function getPublicKey(): string {
  return loadPublicKey();
}

/**
 * Get public key in JWK format for JWKS endpoint
 */
export function getJWKS(): object {
  // Load public key to ensure it exists
  loadPublicKey();
  
  // For production, you would convert the PEM key to JWK format
  // For now, we'll return a basic JWKS structure
  // External consumers can use the PEM key directly via GET /api/jwks
  
  return {
    keys: [
      {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid: 'default',
        // In production, include n and e parameters from the RSA public key
        // For now, consumers should use the PEM endpoint
      },
    ],
  };
}
