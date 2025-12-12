import { prisma } from '../db';
import logger from '../utils/logger';
import { config } from '../config';

/**
 * Key rotation record
 */
export interface KeyRotationRecord {
  id: string;
  keyIdentifier: string;
  keyType: string;
  lastRotatedAt: Date;
  nextRotationDue: Date | null;
  isActive: boolean;
  rotationIntervalDays: number | null;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Key rotation status
 */
export interface KeyRotationStatus {
  keyIdentifier: string;
  keyType: string;
  lastRotatedAt: Date;
  nextRotationDue: Date | null;
  isActive: boolean;
  isOverdue: boolean;
  daysUntilDue: number | null;
  daysSinceRotation: number;
  rotationIntervalDays: number | null;
}

/**
 * Record a key rotation event
 */
export async function recordKeyRotation(
  keyIdentifier: string,
  keyType: 'jwt_signing' | 'jwt_verification' | 'github_token_encryption' | 'other',
  options?: {
    rotationIntervalDays?: number;
    metadata?: string;
  }
): Promise<KeyRotationRecord> {
  const now = new Date();
  
  // Calculate next rotation due date
  let nextRotationDue: Date | null = null;
  const rotationIntervalDays = options?.rotationIntervalDays ?? getDefaultRotationInterval(keyType);
  
  if (rotationIntervalDays > 0) {
    nextRotationDue = new Date(now);
    nextRotationDue.setDate(nextRotationDue.getDate() + rotationIntervalDays);
  }
  
  // Use upsert to avoid race conditions between check and create/update
  const upserted = await prisma.jWTKeyRotation.upsert({
    where: { keyIdentifier },
    update: {
      lastRotatedAt: now,
      nextRotationDue,
      rotationIntervalDays,
      metadata: options?.metadata, // Let metadata be updated if provided
      updatedAt: now,
    },
    create: {
      keyIdentifier,
      keyType,
      lastRotatedAt: now,
      nextRotationDue,
      isActive: true,
      rotationIntervalDays,
      metadata: options?.metadata || null,
    },
  });
  
  logger.info(
    {
      keyIdentifier,
      keyType,
      lastRotatedAt: now,
      nextRotationDue,
    },
    'Key rotation recorded'
  );
  
  return mapToKeyRotationRecord(upserted);
}

/**
 * Get key rotation status
 */
export async function getKeyRotationStatus(
  keyIdentifier: string
): Promise<KeyRotationStatus | null> {
  const record = await prisma.jWTKeyRotation.findUnique({
    where: { keyIdentifier },
  });
  
  if (!record) {
    return null;
  }
  
  return calculateRotationStatus(record);
}

/**
 * Get all key rotation statuses
 */
export async function getAllKeyRotationStatuses(
  activeOnly = true
): Promise<KeyRotationStatus[]> {
  const records = await prisma.jWTKeyRotation.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { lastRotatedAt: 'asc' },
  });
  
  return records.map(calculateRotationStatus);
}

/**
 * Check if a key is overdue for rotation
 */
export async function isKeyRotationOverdue(
  keyIdentifier: string
): Promise<boolean> {
  const status = await getKeyRotationStatus(keyIdentifier);
  if (!status) {
    return false;
  }
  
  return status.isOverdue;
}

/**
 * Initialize key rotation tracking for existing keys
 * This should be called once during deployment to backfill rotation history
 */
export async function initializeKeyRotationTracking(): Promise<void> {
  const now = new Date();
  
  // Track JWT signing key
  await ensureKeyRotationRecord('jwt_signing_key', 'jwt_signing', {
    lastRotatedAt: now,
    rotationIntervalDays: config.rotation.jwtKeyRotationIntervalDays,
    metadata: 'Initialized during deployment',
  });
  
  // Track JWT verification key (same as signing for RS256)
  await ensureKeyRotationRecord('jwt_verification_key', 'jwt_verification', {
    lastRotatedAt: now,
    rotationIntervalDays: config.rotation.jwtKeyRotationIntervalDays,
    metadata: 'Initialized during deployment',
  });
  
  // Track GitHub token encryption key
  await ensureKeyRotationRecord('github_token_encryption_key', 'github_token_encryption', {
    lastRotatedAt: now,
    rotationIntervalDays: config.rotation.githubTokenEncryptionKeyRotationIntervalDays,
    metadata: 'Initialized during deployment',
  });
  
  logger.info('Key rotation tracking initialized for all keys');
}

/**
 * Ensure a key rotation record exists (create if not exists, update if exists)
 */
async function ensureKeyRotationRecord(
  keyIdentifier: string,
  keyType: 'jwt_signing' | 'jwt_verification' | 'github_token_encryption' | 'other',
  options: {
    lastRotatedAt: Date;
    rotationIntervalDays: number;
    metadata?: string;
  }
): Promise<void> {
  const existing = await prisma.jWTKeyRotation.findUnique({
    where: { keyIdentifier },
  });
  
  if (existing) {
    // Don't update if already exists - preserve actual rotation history
    logger.debug({ keyIdentifier }, 'Key rotation record already exists, skipping initialization');
    return;
  }
  
  let nextRotationDue: Date | null = null;
  if (options.rotationIntervalDays > 0) {
    nextRotationDue = new Date(options.lastRotatedAt);
    nextRotationDue.setDate(nextRotationDue.getDate() + options.rotationIntervalDays);
  }
  
  await prisma.jWTKeyRotation.create({
    data: {
      keyIdentifier,
      keyType,
      lastRotatedAt: options.lastRotatedAt,
      nextRotationDue,
      isActive: true,
      rotationIntervalDays: options.rotationIntervalDays,
      metadata: options.metadata || null,
    },
  });
  
  logger.debug({ keyIdentifier }, 'Key rotation record initialized');
}

/**
 * Get default rotation interval for a key type
 */
function getDefaultRotationInterval(
  keyType: 'jwt_signing' | 'jwt_verification' | 'github_token_encryption' | 'other'
): number {
  switch (keyType) {
    case 'jwt_signing':
    case 'jwt_verification':
      return config.rotation.jwtKeyRotationIntervalDays;
    case 'github_token_encryption':
      return config.rotation.githubTokenEncryptionKeyRotationIntervalDays;
    default:
      return 0; // No default for other types
  }
}

/**
 * Calculate rotation status from a database record
 */
function calculateRotationStatus(
  record: {
    id: string;
    keyIdentifier: string;
    keyType: string;
    lastRotatedAt: Date;
    nextRotationDue: Date | null;
    isActive: boolean;
    rotationIntervalDays: number | null;
  }
): KeyRotationStatus {
  const now = new Date();
  const daysSinceRotation = Math.floor(
    (now.getTime() - record.lastRotatedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  let isOverdue = false;
  let daysUntilDue: number | null = null;
  
  if (record.nextRotationDue) {
    daysUntilDue = Math.floor(
      (record.nextRotationDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    isOverdue = daysUntilDue < 0;
  }
  
  return {
    keyIdentifier: record.keyIdentifier,
    keyType: record.keyType,
    lastRotatedAt: record.lastRotatedAt,
    nextRotationDue: record.nextRotationDue,
    isActive: record.isActive,
    isOverdue,
    daysUntilDue,
    daysSinceRotation,
    rotationIntervalDays: record.rotationIntervalDays,
  };
}

/**
 * Map database record to KeyRotationRecord
 */
function mapToKeyRotationRecord(record: {
  id: string;
  keyIdentifier: string;
  keyType: string;
  lastRotatedAt: Date;
  nextRotationDue: Date | null;
  isActive: boolean;
  rotationIntervalDays: number | null;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}): KeyRotationRecord {
  return {
    id: record.id,
    keyIdentifier: record.keyIdentifier,
    keyType: record.keyType,
    lastRotatedAt: record.lastRotatedAt,
    nextRotationDue: record.nextRotationDue,
    isActive: record.isActive,
    rotationIntervalDays: record.rotationIntervalDays,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Check all keys for overdue rotations and log warnings
 */
export async function checkAndLogOverdueRotations(): Promise<void> {
  const statuses = await getAllKeyRotationStatuses(true);
  
  for (const status of statuses) {
    if (status.isOverdue) {
      logger.warn(
        {
          keyIdentifier: status.keyIdentifier,
          keyType: status.keyType,
          daysSinceRotation: status.daysSinceRotation,
          daysOverdue: status.daysUntilDue ? Math.abs(status.daysUntilDue) : null,
        },
        'Key rotation is OVERDUE - rotation required'
      );
    } else if (status.daysUntilDue !== null && status.daysUntilDue <= 30) {
      logger.info(
        {
          keyIdentifier: status.keyIdentifier,
          keyType: status.keyType,
          daysUntilDue: status.daysUntilDue,
        },
        'Key rotation due soon - plan rotation'
      );
    }
  }
}
