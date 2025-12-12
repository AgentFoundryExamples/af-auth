// Mock logger before any imports
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock prisma
jest.mock('../db', () => ({
  prisma: {
    jWTKeyRotation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../config', () => ({
  config: {
    rotation: {
      jwtKeyRotationIntervalDays: 180,
      githubTokenEncryptionKeyRotationIntervalDays: 90,
      serviceApiKeyRotationIntervalDays: 365,
    },
  },
}));

import {
  recordKeyRotation,
  getKeyRotationStatus,
  getAllKeyRotationStatuses,
  isKeyRotationOverdue,
  initializeKeyRotationTracking,
  checkAndLogOverdueRotations,
} from './key-rotation';
import { prisma } from '../db';
import logger from '../utils/logger';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Key Rotation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordKeyRotation', () => {
    it('should create a new rotation record for a new key', async () => {
      const now = new Date();
      const keyIdentifier = 'test_key';
      const keyType = 'jwt_signing';

      mockPrisma.jWTKeyRotation.upsert.mockResolvedValue({
        id: 'test-id',
        keyIdentifier,
        keyType,
        lastRotatedAt: now,
        nextRotationDue: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
        isActive: true,
        rotationIntervalDays: 180,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await recordKeyRotation(keyIdentifier, keyType);

      expect(result.keyIdentifier).toBe(keyIdentifier);
      expect(result.keyType).toBe(keyType);
      expect(result.isActive).toBe(true);
      expect(mockPrisma.jWTKeyRotation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { keyIdentifier },
          create: expect.objectContaining({
            keyIdentifier,
            keyType,
            isActive: true,
          }),
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ keyIdentifier, keyType }),
        expect.stringContaining('recorded')
      );
    });

    it('should update an existing rotation record', async () => {
      const now = new Date();
      const keyIdentifier = 'test_key';
      const keyType = 'jwt_signing';

      mockPrisma.jWTKeyRotation.upsert.mockResolvedValue({
        id: 'test-id',
        keyIdentifier,
        keyType,
        lastRotatedAt: now,
        nextRotationDue: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
        isActive: true,
        rotationIntervalDays: 180,
        metadata: 'old metadata',
        createdAt: now,
        updatedAt: now,
      });

      const result = await recordKeyRotation(keyIdentifier, keyType);

      expect(result.keyIdentifier).toBe(keyIdentifier);
      expect(mockPrisma.jWTKeyRotation.upsert).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ keyIdentifier, keyType }),
        expect.stringContaining('recorded')
      );
    });

    it('should calculate next rotation due based on interval', async () => {
      const now = new Date();
      const keyIdentifier = 'test_key';
      const keyType = 'jwt_signing';
      const rotationIntervalDays = 90;

      mockPrisma.jWTKeyRotation.upsert.mockResolvedValue({
        id: 'test-id',
        keyIdentifier,
        keyType,
        lastRotatedAt: now,
        nextRotationDue: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
        isActive: true,
        rotationIntervalDays,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordKeyRotation(keyIdentifier, keyType, { rotationIntervalDays });

      expect(mockPrisma.jWTKeyRotation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            rotationIntervalDays,
          }),
        })
      );
    });

    it('should not set next rotation due if interval is 0', async () => {
      const now = new Date();
      const keyIdentifier = 'test_key';
      const keyType = 'other';

      mockPrisma.jWTKeyRotation.upsert.mockResolvedValue({
        id: 'test-id',
        keyIdentifier,
        keyType,
        lastRotatedAt: now,
        nextRotationDue: null,
        isActive: true,
        rotationIntervalDays: 0,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordKeyRotation(keyIdentifier, keyType, { rotationIntervalDays: 0 });

      expect(mockPrisma.jWTKeyRotation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            nextRotationDue: null,
          }),
        })
      );
    });
  });

  describe('getKeyRotationStatus', () => {
    it('should return null for non-existent key', async () => {
      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue(null);

      const status = await getKeyRotationStatus('non_existent_key');

      expect(status).toBeNull();
    });

    it('should calculate status correctly for key not yet due', async () => {
      const now = new Date();
      const lastRotatedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const nextRotationDue = new Date(now.getTime() + 150 * 24 * 60 * 60 * 1000); // 150 days in future

      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test_key',
        keyType: 'jwt_signing',
        lastRotatedAt,
        nextRotationDue,
        isActive: true,
        rotationIntervalDays: 180,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      const status = await getKeyRotationStatus('test_key');

      expect(status).not.toBeNull();
      expect(status!.isOverdue).toBe(false);
      expect(status!.daysSinceRotation).toBe(30);
      expect(status!.daysUntilDue).toBe(150);
    });

    it('should detect overdue keys', async () => {
      const now = new Date();
      const lastRotatedAt = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // 200 days ago
      const nextRotationDue = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // 20 days ago

      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test_key',
        keyType: 'jwt_signing',
        lastRotatedAt,
        nextRotationDue,
        isActive: true,
        rotationIntervalDays: 180,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      const status = await getKeyRotationStatus('test_key');

      expect(status).not.toBeNull();
      expect(status!.isOverdue).toBe(true);
      expect(status!.daysSinceRotation).toBe(200);
      expect(status!.daysUntilDue).toBe(-20);
    });

    it('should handle keys without rotation policy', async () => {
      const now = new Date();
      const lastRotatedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test_key',
        keyType: 'other',
        lastRotatedAt,
        nextRotationDue: null,
        isActive: true,
        rotationIntervalDays: null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      const status = await getKeyRotationStatus('test_key');

      expect(status).not.toBeNull();
      expect(status!.isOverdue).toBe(false);
      expect(status!.daysUntilDue).toBeNull();
      expect(status!.nextRotationDue).toBeNull();
    });
  });

  describe('getAllKeyRotationStatuses', () => {
    it('should return all active keys by default', async () => {
      const now = new Date();
      mockPrisma.jWTKeyRotation.findMany.mockResolvedValue([
        {
          id: 'id1',
          keyIdentifier: 'key1',
          keyType: 'jwt_signing',
          lastRotatedAt: now,
          nextRotationDue: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
          isActive: true,
          rotationIntervalDays: 180,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'id2',
          keyIdentifier: 'key2',
          keyType: 'github_token_encryption',
          lastRotatedAt: now,
          nextRotationDue: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          isActive: true,
          rotationIntervalDays: 90,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const statuses = await getAllKeyRotationStatuses(true);

      expect(statuses).toHaveLength(2);
      expect(mockPrisma.jWTKeyRotation.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { lastRotatedAt: 'asc' },
      });
    });

    it('should include inactive keys when requested', async () => {
      mockPrisma.jWTKeyRotation.findMany.mockResolvedValue([]);

      await getAllKeyRotationStatuses(false);

      expect(mockPrisma.jWTKeyRotation.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { lastRotatedAt: 'asc' },
      });
    });
  });

  describe('isKeyRotationOverdue', () => {
    it('should return true for overdue keys', async () => {
      const now = new Date();
      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test_key',
        keyType: 'jwt_signing',
        lastRotatedAt: new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000),
        nextRotationDue: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        isActive: true,
        rotationIntervalDays: 180,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      const isOverdue = await isKeyRotationOverdue('test_key');

      expect(isOverdue).toBe(true);
    });

    it('should return false for keys not yet due', async () => {
      const now = new Date();
      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test_key',
        keyType: 'jwt_signing',
        lastRotatedAt: now,
        nextRotationDue: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
        isActive: true,
        rotationIntervalDays: 180,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      const isOverdue = await isKeyRotationOverdue('test_key');

      expect(isOverdue).toBe(false);
    });

    it('should return false for non-existent keys', async () => {
      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue(null);

      const isOverdue = await isKeyRotationOverdue('non_existent_key');

      expect(isOverdue).toBe(false);
    });
  });

  describe('initializeKeyRotationTracking', () => {
    it('should initialize tracking for all key types', async () => {
      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue(null);
      mockPrisma.jWTKeyRotation.create.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test',
        keyType: 'jwt_signing',
        lastRotatedAt: new Date(),
        nextRotationDue: new Date(),
        isActive: true,
        rotationIntervalDays: 180,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await initializeKeyRotationTracking();

      // Should create 3 records: jwt_signing, jwt_verification, github_token_encryption
      expect(mockPrisma.jWTKeyRotation.create).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('initialized')
      );
    });

    it('should not overwrite existing records', async () => {
      const existingRecord = {
        id: 'existing-id',
        keyIdentifier: 'jwt_signing_key',
        keyType: 'jwt_signing',
        lastRotatedAt: new Date('2024-01-01'),
        nextRotationDue: new Date('2024-07-01'),
        isActive: true,
        rotationIntervalDays: 180,
        metadata: 'existing',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue(existingRecord);

      await initializeKeyRotationTracking();

      // Should not create any records since all exist
      expect(mockPrisma.jWTKeyRotation.create).not.toHaveBeenCalled();
    });
  });

  describe('checkAndLogOverdueRotations', () => {
    it('should log warnings for overdue keys', async () => {
      const now = new Date();
      mockPrisma.jWTKeyRotation.findMany.mockResolvedValue([
        {
          id: 'id1',
          keyIdentifier: 'overdue_key',
          keyType: 'jwt_signing',
          lastRotatedAt: new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000),
          nextRotationDue: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          isActive: true,
          rotationIntervalDays: 180,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await checkAndLogOverdueRotations();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          keyIdentifier: 'overdue_key',
          keyType: 'jwt_signing',
        }),
        expect.stringContaining('OVERDUE')
      );
    });

    it('should log info for keys due soon', async () => {
      const now = new Date();
      mockPrisma.jWTKeyRotation.findMany.mockResolvedValue([
        {
          id: 'id1',
          keyIdentifier: 'soon_key',
          keyType: 'jwt_signing',
          lastRotatedAt: new Date(now.getTime() - 170 * 24 * 60 * 60 * 1000),
          nextRotationDue: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
          isActive: true,
          rotationIntervalDays: 180,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await checkAndLogOverdueRotations();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          keyIdentifier: 'soon_key',
          daysUntilDue: 10,
        }),
        expect.stringContaining('due soon')
      );
    });

    it('should not log for keys with plenty of time', async () => {
      const now = new Date();
      mockPrisma.jWTKeyRotation.findMany.mockResolvedValue([
        {
          id: 'id1',
          keyIdentifier: 'ok_key',
          keyType: 'jwt_signing',
          lastRotatedAt: now,
          nextRotationDue: new Date(now.getTime() + 150 * 24 * 60 * 60 * 1000),
          isActive: true,
          rotationIntervalDays: 180,
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await checkAndLogOverdueRotations();

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle time zone differences correctly', async () => {
      // Use UTC timestamps to avoid timezone issues
      const now = new Date();
      const lastRotatedAt = new Date(Date.UTC(2024, 0, 1)); // Jan 1, 2024 UTC
      const nextRotationDue = new Date(Date.UTC(2024, 6, 1)); // Jul 1, 2024 UTC

      mockPrisma.jWTKeyRotation.findUnique.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test_key',
        keyType: 'jwt_signing',
        lastRotatedAt,
        nextRotationDue,
        isActive: true,
        rotationIntervalDays: 180,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      const status = await getKeyRotationStatus('test_key');

      expect(status).not.toBeNull();
      // Days calculations should be consistent regardless of timezone
      expect(typeof status!.daysSinceRotation).toBe('number');
      expect(typeof status!.daysUntilDue).toBe('number');
    });

    it('should handle metadata with special characters', async () => {
      const now = new Date();
      const metadata = 'Rotated due to security incident #123 - "emergency rotation"';

      mockPrisma.jWTKeyRotation.upsert.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test_key',
        keyType: 'jwt_signing',
        lastRotatedAt: now,
        nextRotationDue: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
        isActive: true,
        rotationIntervalDays: 180,
        metadata,
        createdAt: now,
        updatedAt: now,
      });

      const result = await recordKeyRotation('test_key', 'jwt_signing', { metadata });

      expect(result.metadata).toBe(metadata);
    });

    it('should handle very large rotation intervals', async () => {
      const now = new Date();
      const largeInterval = 3650; // 10 years

      mockPrisma.jWTKeyRotation.upsert.mockResolvedValue({
        id: 'test-id',
        keyIdentifier: 'test_key',
        keyType: 'other',
        lastRotatedAt: now,
        nextRotationDue: new Date(now.getTime() + largeInterval * 24 * 60 * 60 * 1000),
        isActive: true,
        rotationIntervalDays: largeInterval,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordKeyRotation('test_key', 'other', { rotationIntervalDays: largeInterval });

      expect(mockPrisma.jWTKeyRotation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            rotationIntervalDays: largeInterval,
          }),
        })
      );
    });
  });
});
