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
// Mock logger before any imports
jest.mock('../utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
    fatal: jest.fn(),
    trace: jest.fn(),
    level: 'info',
    levels: {
      values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 },
      labels: { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' },
    },
  };
  return {
    __esModule: true,
    default: mockLogger,
  };
});

import { prisma } from '../db';
import * as serviceRegistry from './service-registry';
import bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Mock prisma
jest.mock('../db', () => ({
  prisma: {
    serviceRegistry: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    serviceAuditLog: {
      create: jest.fn(),
    },
  },
}));

describe('Service Registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createService', () => {
    it('should create a new service with hashed API key', async () => {
      const mockHashedKey = 'hashed-api-key';
      mockBcrypt.hash.mockResolvedValue(mockHashedKey as never);

      const mockService = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        serviceIdentifier: 'test-service',
        hashedApiKey: mockHashedKey,
        allowedScopes: [],
        isActive: true,
        description: 'Test service',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      };

      (prisma.serviceRegistry.create as jest.Mock).mockResolvedValue(mockService);

      const result = await serviceRegistry.createService('test-service', 'plain-api-key', {
        description: 'Test service',
      });

      expect(mockBcrypt.hash).toHaveBeenCalledWith('plain-api-key', 12);
      expect(prisma.serviceRegistry.create).toHaveBeenCalledWith({
        data: {
          serviceIdentifier: 'test-service',
          hashedApiKey: mockHashedKey,
          allowedScopes: [],
          description: 'Test service',
          isActive: true,
        },
      });
      expect(result.serviceIdentifier).toBe('test-service');
      expect(result.id).toBe(mockService.id);
    });

    it('should create service with custom scopes', async () => {
      const mockHashedKey = 'hashed-api-key';
      mockBcrypt.hash.mockResolvedValue(mockHashedKey as never);

      const mockService = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        serviceIdentifier: 'test-service',
        hashedApiKey: mockHashedKey,
        allowedScopes: ['read', 'write'],
        isActive: true,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      };

      (prisma.serviceRegistry.create as jest.Mock).mockResolvedValue(mockService);

      const result = await serviceRegistry.createService('test-service', 'plain-api-key', {
        allowedScopes: ['read', 'write'],
      });

      expect(result.allowedScopes).toEqual(['read', 'write']);
    });
  });

  describe('authenticateService', () => {
    it('should authenticate service with valid credentials', async () => {
      const mockService = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        serviceIdentifier: 'test-service',
        hashedApiKey: 'hashed-key',
        allowedScopes: [],
        isActive: true,
        description: 'Test service',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      };

      (prisma.serviceRegistry.findUnique as jest.Mock).mockResolvedValue(mockService);
      mockBcrypt.compare.mockResolvedValue(true as never);
      (prisma.serviceRegistry.update as jest.Mock).mockResolvedValue(mockService);

      const result = await serviceRegistry.authenticateService('test-service', 'plain-api-key');

      expect(result.authenticated).toBe(true);
      expect(result.service?.serviceIdentifier).toBe('test-service');
      expect(prisma.serviceRegistry.update).toHaveBeenCalledWith({
        where: { id: mockService.id },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('should reject authentication for non-existent service', async () => {
      (prisma.serviceRegistry.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await serviceRegistry.authenticateService('unknown-service', 'api-key');

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Service not found');
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should reject authentication for inactive service', async () => {
      const mockService = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        serviceIdentifier: 'test-service',
        hashedApiKey: 'hashed-key',
        allowedScopes: [],
        isActive: false,
        description: 'Test service',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      };

      (prisma.serviceRegistry.findUnique as jest.Mock).mockResolvedValue(mockService);

      const result = await serviceRegistry.authenticateService('test-service', 'api-key');

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Service is inactive');
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should reject authentication with invalid API key', async () => {
      const mockService = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        serviceIdentifier: 'test-service',
        hashedApiKey: 'hashed-key',
        allowedScopes: [],
        isActive: true,
        description: 'Test service',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      };

      (prisma.serviceRegistry.findUnique as jest.Mock).mockResolvedValue(mockService);
      mockBcrypt.compare.mockResolvedValue(false as never);

      const result = await serviceRegistry.authenticateService('test-service', 'wrong-key');

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid API key');
      expect(prisma.serviceRegistry.update).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      (prisma.serviceRegistry.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const result = await serviceRegistry.authenticateService('test-service', 'api-key');

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Authentication error');
    });
  });

  describe('getService', () => {
    it('should return service if found', async () => {
      const mockService = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        serviceIdentifier: 'test-service',
        hashedApiKey: 'hashed-key',
        allowedScopes: ['read'],
        isActive: true,
        description: 'Test service',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      };

      (prisma.serviceRegistry.findUnique as jest.Mock).mockResolvedValue(mockService);

      const result = await serviceRegistry.getService('test-service');

      expect(result).not.toBeNull();
      expect(result?.serviceIdentifier).toBe('test-service');
      expect(result?.allowedScopes).toEqual(['read']);
    });

    it('should return null if service not found', async () => {
      (prisma.serviceRegistry.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await serviceRegistry.getService('unknown-service');

      expect(result).toBeNull();
    });
  });

  describe('rotateServiceApiKey', () => {
    it('should update service with new hashed API key', async () => {
      const mockHashedKey = 'new-hashed-key';
      mockBcrypt.hash.mockResolvedValue(mockHashedKey as never);
      (prisma.serviceRegistry.update as jest.Mock).mockResolvedValue({});

      await serviceRegistry.rotateServiceApiKey('test-service', 'new-api-key');

      expect(mockBcrypt.hash).toHaveBeenCalledWith('new-api-key', 12);
      expect(prisma.serviceRegistry.update).toHaveBeenCalledWith({
        where: { serviceIdentifier: 'test-service' },
        data: { hashedApiKey: mockHashedKey },
      });
    });
  });

  describe('deactivateService', () => {
    it('should set isActive to false', async () => {
      (prisma.serviceRegistry.update as jest.Mock).mockResolvedValue({});

      await serviceRegistry.deactivateService('test-service');

      expect(prisma.serviceRegistry.update).toHaveBeenCalledWith({
        where: { serviceIdentifier: 'test-service' },
        data: { isActive: false },
      });
    });
  });

  describe('activateService', () => {
    it('should set isActive to true', async () => {
      (prisma.serviceRegistry.update as jest.Mock).mockResolvedValue({});

      await serviceRegistry.activateService('test-service');

      expect(prisma.serviceRegistry.update).toHaveBeenCalledWith({
        where: { serviceIdentifier: 'test-service' },
        data: { isActive: true },
      });
    });
  });

  describe('deleteService', () => {
    it('should permanently delete service', async () => {
      (prisma.serviceRegistry.delete as jest.Mock).mockResolvedValue({});

      await serviceRegistry.deleteService('test-service');

      expect(prisma.serviceRegistry.delete).toHaveBeenCalledWith({
        where: { serviceIdentifier: 'test-service' },
      });
    });
  });

  describe('listServices', () => {
    it('should return all services when activeOnly is false', async () => {
      const mockServices = [
        {
          id: '1',
          serviceIdentifier: 'service-1',
          hashedApiKey: 'hash1',
          allowedScopes: [],
          isActive: true,
          description: 'Service 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: null,
        },
        {
          id: '2',
          serviceIdentifier: 'service-2',
          hashedApiKey: 'hash2',
          allowedScopes: [],
          isActive: false,
          description: 'Service 2',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: null,
        },
      ];

      (prisma.serviceRegistry.findMany as jest.Mock).mockResolvedValue(mockServices);

      const result = await serviceRegistry.listServices(false);

      expect(result).toHaveLength(2);
      expect(prisma.serviceRegistry.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return only active services when activeOnly is true', async () => {
      const mockServices = [
        {
          id: '1',
          serviceIdentifier: 'service-1',
          hashedApiKey: 'hash1',
          allowedScopes: [],
          isActive: true,
          description: 'Service 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: null,
        },
      ];

      (prisma.serviceRegistry.findMany as jest.Mock).mockResolvedValue(mockServices);

      const result = await serviceRegistry.listServices(true);

      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
      expect(prisma.serviceRegistry.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('logServiceAccess', () => {
    it('should log successful access attempt', async () => {
      (prisma.serviceAuditLog.create as jest.Mock).mockResolvedValue({});

      await serviceRegistry.logServiceAccess(
        'service-id',
        'user-id',
        'retrieve_github_token',
        true,
        {
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
        }
      );

      expect(prisma.serviceAuditLog.create).toHaveBeenCalledWith({
        data: {
          serviceId: 'service-id',
          userId: 'user-id',
          action: 'retrieve_github_token',
          success: true,
          errorMessage: null,
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
        },
      });
    });

    it('should log failed access attempt with error message', async () => {
      (prisma.serviceAuditLog.create as jest.Mock).mockResolvedValue({});

      await serviceRegistry.logServiceAccess(
        'service-id',
        'user-id',
        'retrieve_github_token',
        false,
        {
          errorMessage: 'User not whitelisted',
        }
      );

      expect(prisma.serviceAuditLog.create).toHaveBeenCalledWith({
        data: {
          serviceId: 'service-id',
          userId: 'user-id',
          action: 'retrieve_github_token',
          success: false,
          errorMessage: 'User not whitelisted',
          ipAddress: null,
          userAgent: null,
        },
      });
    });

    it('should handle logging errors gracefully', async () => {
      (prisma.serviceAuditLog.create as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      // Should not throw
      await expect(
        serviceRegistry.logServiceAccess('service-id', 'user-id', 'action', true)
      ).resolves.not.toThrow();
    });
  });
});
