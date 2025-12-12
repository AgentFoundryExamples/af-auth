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
import { prisma } from '../db';
import logger from '../utils/logger';
import { verifyJWT } from './jwt';
import { config } from '../config';
import { recordTokenRevocationCheck, recordJWTOperation } from './metrics';

/**
 * Parse time string to milliseconds
 * Supports formats like '30d', '7d', '24h', '60m', '3600s'
 */
function parseTimeToMs(timeStr: string): number {
  const match = timeStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    // Default to 30 days if invalid format
    return 30 * 24 * 60 * 60 * 1000;
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Revoke a JWT token
 * @param token - The JWT token to revoke
 * @param revokedBy - Identifier of who revoked the token (e.g., admin user ID or system)
 * @param reason - Optional reason for revocation
 * @returns The revoked token record
 */
export async function revokeToken(
  token: string,
  revokedBy?: string,
  reason?: string
): Promise<{ success: boolean; jti?: string; error?: string }> {
  try {
    // Verify and decode the token
    const verifyResult = verifyJWT(token);
    
    if (!verifyResult.valid || !verifyResult.claims) {
      return {
        success: false,
        error: 'Invalid token',
      };
    }
    
    const { claims } = verifyResult;
    
    if (!claims.jti) {
      return {
        success: false,
        error: 'Token does not have JTI claim',
      };
    }
    
    // Check if already revoked
    const existing = await prisma.revokedToken.findUnique({
      where: { jti: claims.jti },
    });
    
    if (existing) {
      logger.debug({ jti: claims.jti }, 'Token already revoked');
      return {
        success: true,
        jti: claims.jti,
      };
    }
    
    // Calculate token expiry from claims
    // Use configured JWT expiration as fallback instead of hardcoded value
    const tokenExpiresAt = claims.exp 
      ? new Date(claims.exp * 1000) 
      : new Date(Date.now() + parseTimeToMs(config.jwt.expiresIn));
    const tokenIssuedAt = claims.iat ? new Date(claims.iat * 1000) : new Date();
    
    // Add to revoked tokens table
    await prisma.revokedToken.create({
      data: {
        jti: claims.jti,
        userId: claims.sub,
        tokenIssuedAt,
        tokenExpiresAt,
        revokedBy: revokedBy || null,
        reason: reason || null,
      },
    });
    
    logger.info(
      { jti: claims.jti, userId: claims.sub, revokedBy },
      'Token revoked successfully'
    );
    
    recordJWTOperation('revoke', 'success');
    
    return {
      success: true,
      jti: claims.jti,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Error revoking token');
    recordJWTOperation('revoke', 'failure');
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Revoke all tokens for a specific user by removing their whitelist status
 * This effectively invalidates all current and future tokens for the user
 * Note: This does NOT track individual tokens in the revoked_tokens table.
 * Instead, it removes whitelist access, which is checked on every request.
 * @param userId - User ID whose access should be revoked
 * @param revokedBy - Identifier of who revoked the access
 * @param _reason - Optional reason for revocation (not currently stored)
 * @returns Success status (count is always 0 as individual tokens aren't tracked)
 */
export async function revokeAllUserTokens(
  userId: string,
  revokedBy?: string,
  _reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Update user whitelist status to revoke access
    // All existing tokens will be rejected on next use due to whitelist check
    await prisma.user.update({
      where: { id: userId },
      data: { isWhitelisted: false },
    });
    
    logger.info(
      { userId, revokedBy },
      'User access revoked via whitelist removal'
    );
    
    return {
      success: true,
      message: 'User access revoked. All tokens will be rejected on next use.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ userId, errorMessage }, 'Error revoking user access');
    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * Check if a token is revoked
 * @param jti - JWT ID to check
 * @returns True if revoked, false otherwise
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const revokedToken = await prisma.revokedToken.findUnique({
      where: { jti },
    });
    
    const isRevoked = revokedToken !== null;
    recordTokenRevocationCheck('success', isRevoked ? 'revoked' : 'valid');
    
    return isRevoked;
  } catch (error) {
    logger.error({ jti, error }, 'Error checking token revocation status');
    recordTokenRevocationCheck('failure', 'error');
    throw error;
  }
}

/**
 * Clean up expired revoked tokens
 * Should be run periodically to prevent table bloat
 * @param olderThanDays - Remove tokens that expired more than this many days ago
 * @param dryRun - If true, count records instead of deleting them
 * @returns Number of records deleted or that would be deleted
 */
export async function cleanupExpiredRevokedTokens(olderThanDays = 7, dryRun = false): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  const where = {
    tokenExpiresAt: {
      lt: cutoffDate,
    },
  };
  
  if (dryRun) {
    const count = await prisma.revokedToken.count({ where });
    logger.info(
      { count, olderThanDays },
      'Dry run: Found expired revoked tokens to clean up'
    );
    return count;
  }
  
  const result = await prisma.revokedToken.deleteMany({ where });
  
  logger.info(
    { count: result.count, olderThanDays },
    'Cleaned up expired revoked tokens'
  );
  
  return result.count;
}

/**
 * Get revocation status for a token
 * @param jti - JWT ID to check
 * @returns Revocation details if revoked, null otherwise
 */
export async function getRevocationStatus(jti: string) {
  return prisma.revokedToken.findUnique({
    where: { jti },
    select: {
      jti: true,
      userId: true,
      revokedAt: true,
      revokedBy: true,
      reason: true,
      tokenExpiresAt: true,
    },
  });
}
