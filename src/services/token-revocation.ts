import { prisma } from '../db';
import logger from '../utils/logger';
import { verifyJWT } from './jwt';

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
    const tokenExpiresAt = claims.exp ? new Date(claims.exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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
    
    return {
      success: true,
      jti: claims.jti,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Error revoking token');
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
  const revokedToken = await prisma.revokedToken.findUnique({
    where: { jti },
  });
  
  return revokedToken !== null;
}

/**
 * Clean up expired revoked tokens
 * Should be run periodically to prevent table bloat
 * @param olderThanDays - Remove tokens that expired more than this many days ago
 * @returns Number of records deleted
 */
export async function cleanupExpiredRevokedTokens(olderThanDays = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  const result = await prisma.revokedToken.deleteMany({
    where: {
      tokenExpiresAt: {
        lt: cutoffDate,
      },
    },
  });
  
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
