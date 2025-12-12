#!/usr/bin/env tsx
/**
 * Script to clean up expired revoked tokens from the database
 * Should be run periodically (e.g., daily via cron) to prevent table bloat
 */

import { cleanupExpiredRevokedTokens } from '../src/services/token-revocation';
import { connect, disconnect } from '../src/db';
import logger from '../src/utils/logger';

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    
    // Get retention period from args or use default (7 days)
    const retentionArg = args.find(arg => arg.startsWith('--retention='));
    const retentionDays = retentionArg
      ? parseInt(retentionArg.split('=')[1], 10)
      : 7;
    
    if (isNaN(retentionDays) || retentionDays < 1) {
      console.error('Error: Invalid retention period. Must be a positive number.');
      process.exit(1);
    }
    
    logger.info(
      { retentionDays, dryRun },
      'Starting revoked token cleanup'
    );
    
    // Connect to database
    await connect();
    
    if (dryRun) {
      console.log(`\n[DRY RUN MODE]`);
      console.log(`Checking for tokens that expired more than ${retentionDays} days ago...\n`);
      // In dry run mode, query and show what would be deleted
      const count = await cleanupExpiredRevokedTokens(retentionDays, true);
      console.log(`   Would delete ${count} expired revoked token(s)`);
      console.log(`   Retention period: ${retentionDays} days\n`);
      logger.info({ count, retentionDays }, 'Dry run complete - no changes made');
    } else {
      // Perform cleanup
      const deletedCount = await cleanupExpiredRevokedTokens(retentionDays, false);
      
      console.log(`\n✅ Cleanup complete`);
      console.log(`   Deleted ${deletedCount} expired revoked token(s)`);
      console.log(`   Retention period: ${retentionDays} days\n`);
      
      logger.info({ deletedCount, retentionDays }, 'Cleanup complete');
    }
    
    // Disconnect from database
    await disconnect();
    
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ errorMessage }, 'Failed to cleanup revoked tokens');
    console.error(`\n❌ Error: ${errorMessage}\n`);
    process.exit(1);
  }
}

// Show usage if --help is passed
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: tsx scripts/cleanup-revoked-tokens.ts [OPTIONS]

Clean up expired revoked tokens from the database.

Options:
  --dry-run              Run in dry-run mode (show what would be deleted without actually deleting)
  --retention=DAYS       Number of days to retain expired tokens (default: 7)
  --help, -h            Show this help message

Examples:
  # Clean up tokens expired more than 7 days ago
  tsx scripts/cleanup-revoked-tokens.ts

  # Clean up tokens expired more than 30 days ago
  tsx scripts/cleanup-revoked-tokens.ts --retention=30

  # Preview what would be deleted
  tsx scripts/cleanup-revoked-tokens.ts --dry-run

  # Use in cron job (daily at 2 AM)
  # 0 2 * * * cd /app && npm run cleanup:revoked-tokens >> /var/log/cleanup.log 2>&1
`);
  process.exit(0);
}

main();
