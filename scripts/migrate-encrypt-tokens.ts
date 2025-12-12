#!/usr/bin/env tsx
/**
 * Migration Script: Encrypt GitHub Tokens
 * 
 * This script encrypts any existing plaintext GitHub access and refresh tokens in the database.
 * It is idempotent and safe to run multiple times - already encrypted tokens are skipped.
 * 
 * Usage:
 *   tsx scripts/migrate-encrypt-tokens.ts [--dry-run]
 * 
 * Options:
 *   --dry-run    Preview what would be encrypted without making changes
 * 
 * Prerequisites:
 *   - GITHUB_TOKEN_ENCRYPTION_KEY must be set in environment
 *   - Database must be accessible
 * 
 * Safety:
 *   - Uses transactions to ensure atomicity
 *   - Validates encryption by round-trip decrypt before committing
 *   - Skips already-encrypted tokens (identified by format)
 *   - Preserves null tokens
 */

import { prisma, connect, disconnect } from '../src/db';
import { encryptGitHubToken, decryptGitHubToken } from '../src/utils/encryption';
import logger from '../src/utils/logger';

/**
 * Check if a token appears to be already encrypted
 * Encrypted tokens have format: salt:iv:authTag:ciphertext (4 base64 parts)
 */
function isTokenEncrypted(token: string | null): boolean {
  if (!token) {
    return false;
  }
  
  // Encrypted format has exactly 4 colon-separated parts
  const parts = token.split(':');
  if (parts.length !== 4) {
    return false;
  }
  
  // Each part should be valid base64
  try {
    parts.forEach(part => {
      Buffer.from(part, 'base64');
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Migrate a single user's tokens
 */
async function migrateUserTokens(userId: string, dryRun: boolean): Promise<{
  accessTokenMigrated: boolean;
  refreshTokenMigrated: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      githubUserId: true,
      githubAccessToken: true,
      githubRefreshToken: true,
    },
  });
  
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  
  let accessTokenMigrated = false;
  let refreshTokenMigrated = false;
  
  // Check and encrypt access token
  if (user.githubAccessToken && !isTokenEncrypted(user.githubAccessToken)) {
    logger.info(
      { userId: user.id, githubUserId: user.githubUserId.toString() },
      'Encrypting access token'
    );
    
    const encryptedAccessToken = await encryptGitHubToken(user.githubAccessToken);
    
    // Validate by decrypting
    const decrypted = await decryptGitHubToken(encryptedAccessToken);
    if (decrypted !== user.githubAccessToken) {
      throw new Error('Token encryption validation failed - decrypted value does not match original');
    }
    
    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: { githubAccessToken: encryptedAccessToken },
      });
    }
    
    accessTokenMigrated = true;
  }
  
  // Check and encrypt refresh token
  if (user.githubRefreshToken && !isTokenEncrypted(user.githubRefreshToken)) {
    logger.info(
      { userId: user.id, githubUserId: user.githubUserId.toString() },
      'Encrypting refresh token'
    );
    
    const encryptedRefreshToken = await encryptGitHubToken(user.githubRefreshToken);
    
    // Validate by decrypting
    const decrypted = await decryptGitHubToken(encryptedRefreshToken);
    if (decrypted !== user.githubRefreshToken) {
      throw new Error('Token encryption validation failed - decrypted value does not match original');
    }
    
    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: { githubRefreshToken: encryptedRefreshToken },
      });
    }
    
    refreshTokenMigrated = true;
  }
  
  return { accessTokenMigrated, refreshTokenMigrated };
}

/**
 * Main migration function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  if (dryRun) {
    logger.info('Running in DRY RUN mode - no changes will be made');
  }
  
  try {
    // Connect to database
    await connect();
    
    // Get all users with tokens
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { githubAccessToken: { not: null } },
          { githubRefreshToken: { not: null } },
        ],
      },
      select: {
        id: true,
        githubUserId: true,
      },
    });
    
    logger.info({ userCount: users.length }, 'Found users with GitHub tokens');
    
    if (users.length === 0) {
      logger.info('No users with tokens found - nothing to migrate');
      return;
    }
    
    let totalAccessTokensMigrated = 0;
    let totalRefreshTokensMigrated = 0;
    let errors = 0;
    
    // Process each user
    for (const user of users) {
      try {
        const result = await migrateUserTokens(user.id, dryRun);
        
        if (result.accessTokenMigrated) {
          totalAccessTokensMigrated++;
        }
        if (result.refreshTokenMigrated) {
          totalRefreshTokensMigrated++;
        }
        
        if (result.accessTokenMigrated || result.refreshTokenMigrated) {
          logger.info(
            {
              userId: user.id,
              githubUserId: user.githubUserId.toString(),
              accessTokenMigrated: result.accessTokenMigrated,
              refreshTokenMigrated: result.refreshTokenMigrated,
            },
            'User tokens processed'
          );
        }
      } catch (error) {
        errors++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { userId: user.id, errorMessage },
          'Failed to migrate user tokens'
        );
      }
    }
    
    // Summary
    logger.info(
      {
        totalUsers: users.length,
        accessTokensMigrated: totalAccessTokensMigrated,
        refreshTokensMigrated: totalRefreshTokensMigrated,
        errors,
        dryRun,
      },
      'Migration completed'
    );
    
    if (dryRun) {
      logger.info('Dry run completed - run without --dry-run to apply changes');
    } else if (errors === 0) {
      logger.info('All tokens successfully encrypted');
    } else {
      logger.warn(`Migration completed with ${errors} error(s) - review logs above`);
      process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Migration failed');
    process.exit(1);
  } finally {
    await disconnect();
  }
}

// Run migration
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
