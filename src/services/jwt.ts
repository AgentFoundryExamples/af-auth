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
import jwt from 'jsonwebtoken';
import { config } from '../config';
import logger from '../utils/logger';
import { prisma } from '../db';
import type { StringValue } from 'ms';
import { randomUUID } from 'crypto';

/**
 * JWT Claims structure
 */
export interface JWTClaims {
  sub: string; // Internal user UUID
  githubId: string; // GitHub user ID
  jti: string; // JWT ID for revocation tracking
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

// Cache keys in memory for performance (loaded from config on initialization)
let cachedPrivateKey: string | null = null;
let cachedPublicKey: string | null = null;

function getPrivateKey(): string {
  if (!cachedPrivateKey) {
    cachedPrivateKey = config.jwt.privateKey;
    logger.debug('JWT private key loaded from configuration');
  }
  return cachedPrivateKey;
}

function getPublicKey(): string {
  if (!cachedPublicKey) {
    cachedPublicKey = config.jwt.publicKey;
    logger.debug('JWT public key loaded from configuration');
  }
  return cachedPublicKey;
}

/**
 * Sign a JWT with the provided claims
 * Uses RS256 algorithm with private key
 */
export function signJWT(claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  const privateKey = getPrivateKey();
  
  const payload: Omit<JWTClaims, 'iat' | 'exp'> = {
    ...claims,
    iss: config.jwt.issuer,
    aud: config.jwt.audience,
  };
  
  const options: jwt.SignOptions = {
    algorithm: 'RS256',
    expiresIn: config.jwt.expiresIn as StringValue,
  };
  
  const token = jwt.sign(payload, privateKey, options);
  
  logger.debug(
    { sub: claims.sub, jti: claims.jti, expiresIn: config.jwt.expiresIn },
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
    const publicKey = getPublicKey();
    
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
      const errorMessage = error.message;
      logger.debug({ errorMessage }, 'JWT verification failed: invalid token');
      return {
        valid: false,
        error: errorMessage,
        expired: false,
      };
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ errorMessage }, 'Unexpected error during JWT verification');
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
  
  // Generate unique JTI for revocation tracking using UUID v4 for maximum unpredictability
  const jti = randomUUID();
  
  const claims: Omit<JWTClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
    sub: user.id,
    // Convert BigInt to string for JSON compatibility
    // GitHub user IDs are within safe integer range, so no precision loss expected
    githubId: user.githubUserId.toString(),
    jti,
  };
  
  return signJWT(claims);
}

/**
 * Refresh a JWT by validating the old token and issuing a new one
 * Validates:
 * - Token signature and expiry
 * - User still exists in database
 * - User is still whitelisted (checked from database)
 * - Token has not been revoked
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
  
  // Check if token is revoked
  if (claims.jti) {
    const revokedToken = await prisma.revokedToken.findUnique({
      where: { jti: claims.jti },
    });
    
    if (revokedToken) {
      throw new Error('TOKEN_REVOKED');
    }
  }
  
  // Fetch current user data
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
  });
  
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  
  // Check whitelist status from database (not from token)
  if (!user.isWhitelisted) {
    throw new Error('WHITELIST_REVOKED');
  }
  
  // Generate and return new JWT with current user data
  return generateJWT(user.id);
}

/**
 * Get public key in PEM format for external verification
 */
export function getPublicKeyForVerification(): string {
  return getPublicKey();
}

/**
 * Get public key in JWK format for JWKS endpoint
 * Note: This returns a minimal JWKS structure. The actual public key is provided
 * in PEM format via the publicKeyPEM field. For full JWK compliance, use a library
 * like node-jose or pem-jwk to convert the PEM key to proper JWK format with n and e parameters.
 */
export function getJWKS(): object {
  // Load public key to ensure it exists
  getPublicKey();
  
  return {
    note: 'This is a simplified JWKS response. For verification, use the PEM key from the publicKeyPEM field or /api/jwks endpoint.',
    keys: [
      {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        kid: 'default',
        // To include proper 'n' and 'e' parameters, convert PEM to JWK using a library like pem-jwk
      },
    ],
  };
}
