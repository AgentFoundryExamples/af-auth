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
    
    // Process each user - wrap in transaction for safety
    for (const user of users) {
      try {
        // Use a transaction to ensure atomicity for each user's migration
        const result = await prisma.$transaction(async (tx) => {
          // Re-fetch user within transaction to ensure we have the latest data
          const userInTx = await tx.user.findUnique({
            where: { id: user.id },
            select: {
              id: true,
              githubUserId: true,
              githubAccessToken: true,
              githubRefreshToken: true,
            },
          });
          
          if (!userInTx) {
            throw new Error(`User ${user.id} not found in transaction`);
          }
          
          let accessTokenMigrated = false;
          let refreshTokenMigrated = false;
          
          // Prepare data to update - combine both tokens into a single atomic update
          const dataToUpdate: {
            githubAccessToken?: string;
            githubRefreshToken?: string;
          } = {};
          
          // Check and encrypt access token
          if (userInTx.githubAccessToken && !isTokenEncrypted(userInTx.githubAccessToken)) {
            logger.info(
              { userId: userInTx.id, githubUserId: userInTx.githubUserId.toString() },
              'Encrypting access token'
            );
            
            const encryptedAccessToken = await encryptGitHubToken(userInTx.githubAccessToken);
            
            // Validate by decrypting
            const decrypted = await decryptGitHubToken(encryptedAccessToken);
            if (decrypted !== userInTx.githubAccessToken) {
              throw new Error('Access token encryption validation failed');
            }
            
            dataToUpdate.githubAccessToken = encryptedAccessToken;
            accessTokenMigrated = true;
          }
          
          // Check and encrypt refresh token
          if (userInTx.githubRefreshToken && !isTokenEncrypted(userInTx.githubRefreshToken)) {
            logger.info(
              { userId: userInTx.id, githubUserId: userInTx.githubUserId.toString() },
              'Encrypting refresh token'
            );
            
            const encryptedRefreshToken = await encryptGitHubToken(userInTx.githubRefreshToken);
            
            // Validate by decrypting
            const decrypted = await decryptGitHubToken(encryptedRefreshToken);
            if (decrypted !== userInTx.githubRefreshToken) {
              throw new Error('Refresh token encryption validation failed');
            }
            
            dataToUpdate.githubRefreshToken = encryptedRefreshToken;
            refreshTokenMigrated = true;
          }
          
          // Perform a single atomic update for both tokens (if any need updating)
          if (!dryRun && Object.keys(dataToUpdate).length > 0) {
            await tx.user.update({
              where: { id: userInTx.id },
              data: dataToUpdate,
            });
          }
          
          return { accessTokenMigrated, refreshTokenMigrated };
        });
        
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
