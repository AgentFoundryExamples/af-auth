#!/usr/bin/env node
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

/**
 * Key Rotation Status Checker
 * 
 * This script checks the rotation status of all keys and displays:
 * - Last rotation date
 * - Next rotation due date
 * - Days until due (or overdue)
 * - Warnings for overdue keys
 * 
 * Usage:
 *   npm run check-key-rotation
 *   npm run check-key-rotation -- --all  (include inactive keys)
 */

import {
  getAllKeyRotationStatuses,
  initializeKeyRotationTracking,
} from '../src/services/key-rotation';
import { listServices } from '../src/services/service-registry';
import { config } from '../src/config';
import db from '../src/db';

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Format days with color coding
 */
function formatDays(days: number | null, isOverdue: boolean): string {
  if (days === null) {
    return 'N/A';
  }
  
  if (isOverdue) {
    return `⚠️  ${Math.abs(days)} days OVERDUE`;
  } else if (days <= 7) {
    return `⚠️  ${days} days (urgent)`;
  } else if (days <= 30) {
    return `⚡ ${days} days (soon)`;
  } else {
    return `✓ ${days} days`;
  }
}

/**
 * Display key rotation status
 * @returns true if any keys are overdue
 */
async function displayKeyRotationStatus(activeOnly: boolean): Promise<boolean> {
  console.log('🔑 JWT Key Rotation Status');
  console.log('═'.repeat(80));
  console.log('');
  
  const statuses = await getAllKeyRotationStatuses(activeOnly);
  
  if (statuses.length === 0) {
    console.log('⚠️  No key rotation records found.');
    console.log('');
    console.log('This may be the first time running the service.');
    console.log('Initializing key rotation tracking with current date...');
    console.log('');
    
    await initializeKeyRotationTracking();
    
    console.log('✓ Key rotation tracking initialized.');
    console.log('');
    console.log('Run this command again to see the status.');
    return false;
  }
  
  let hasOverdue = false;
  
  for (const status of statuses) {
    const activeFlag = status.isActive ? '✓' : '✗';
    console.log(`${activeFlag} ${status.keyIdentifier} (${status.keyType})`);
    console.log(`  Last Rotated:     ${formatDate(status.lastRotatedAt)} (${status.daysSinceRotation} days ago)`);
    
    if (status.nextRotationDue) {
      console.log(`  Next Rotation:    ${formatDate(status.nextRotationDue)}`);
      console.log(`  Status:           ${formatDays(status.daysUntilDue, status.isOverdue)}`);
    } else {
      console.log(`  Next Rotation:    Not scheduled`);
      console.log(`  Status:           No rotation policy configured`);
    }
    
    if (status.rotationIntervalDays !== null) {
      console.log(`  Rotation Policy:  Every ${status.rotationIntervalDays} days`);
    }
    
    console.log('');
    
    if (status.isOverdue) {
      hasOverdue = true;
    }
  }
  
  console.log('─'.repeat(80));
  console.log('');
  console.log('Configuration:');
  console.log(`  JWT Keys:                  Rotate every ${config.rotation.jwtKeyRotationIntervalDays} days`);
  console.log(`  GitHub Encryption Key:     Rotate every ${config.rotation.githubTokenEncryptionKeyRotationIntervalDays} days`);
  console.log(`  Service API Keys:          Rotate every ${config.rotation.serviceApiKeyRotationIntervalDays} days`);
  console.log('');
  
  if (hasOverdue) {
    console.log('⚠️  WARNING: One or more keys are OVERDUE for rotation!');
    console.log('   Review docs/security.md for rotation procedures.');
    console.log('');
  }
  
  return hasOverdue;
}

/**
 * Display service API key rotation status
 * @returns true if any service API keys are overdue
 */
async function displayServiceRotationStatus(activeOnly: boolean): Promise<boolean> {
  console.log('🔐 Service API Key Rotation Status');
  console.log('═'.repeat(80));
  console.log('');
  
  const services = await listServices(activeOnly);
  
  if (services.length === 0) {
    console.log('No services found.');
    console.log('');
    return false;
  }
  
  const now = new Date();
  const rotationIntervalDays = config.rotation.serviceApiKeyRotationIntervalDays;
  const rotationIntervalMs = rotationIntervalDays * 24 * 60 * 60 * 1000;
  let hasOverdue = false;
  
  for (const service of services) {
    const activeFlag = service.isActive ? '✓' : '✗';
    console.log(`${activeFlag} ${service.serviceIdentifier}`);
    
    if (service.lastApiKeyRotatedAt) {
      const daysSinceRotation = Math.floor(
        (now.getTime() - service.lastApiKeyRotatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      console.log(`  Last Rotated:     ${formatDate(service.lastApiKeyRotatedAt)} (${daysSinceRotation} days ago)`);
      
      if (rotationIntervalDays > 0) {
        const nextDue = new Date(service.lastApiKeyRotatedAt.getTime() + rotationIntervalMs);
        const daysUntilDue = Math.floor(
          (nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        const isOverdue = daysUntilDue < 0;
        
        console.log(`  Next Rotation:    ${formatDate(nextDue)}`);
        console.log(`  Status:           ${formatDays(daysUntilDue, isOverdue)}`);
        
        if (isOverdue) {
          hasOverdue = true;
        }
      } else {
        console.log(`  Status:           No rotation policy configured`);
      }
    } else {
      console.log(`  Last Rotated:     Never (created ${formatDate(service.createdAt)})`);
      console.log(`  Status:           ⚠️  No rotation history - consider rotating soon`);
    }
    
    if (service.lastUsedAt) {
      console.log(`  Last Used:        ${formatDate(service.lastUsedAt)}`);
    }
    
    console.log('');
  }
  
  console.log('─'.repeat(80));
  console.log('');
  
  return hasOverdue;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const includeInactive = args.includes('--all');
  
  try {
    await db.connect();
    
    const jwtKeysOverdue = await displayKeyRotationStatus(!includeInactive);
    const serviceKeysOverdue = await displayServiceRotationStatus(!includeInactive);
    
    console.log('✓ Key rotation status check complete.');
    console.log('');
    console.log('For rotation procedures, see:');
    console.log('  - docs/security.md (JWT and encryption key rotation)');
    console.log('  - docs/operations.md (operational procedures)');
    console.log('');
    
    await db.disconnect();
    
    // Exit with non-zero code if any keys are overdue (for CI/CD integration)
    if (jwtKeysOverdue || serviceKeysOverdue) {
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error: ${errorMessage}`);
    await db.disconnect();
    process.exit(1);
  }
}

main();
