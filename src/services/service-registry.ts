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
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import logger from '../utils/logger';

const BCRYPT_ROUNDS = 12;

/**
 * Service registry entry
 */
export interface ServiceRegistryEntry {
  id: string;
  serviceIdentifier: string;
  allowedScopes: string[];
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  lastApiKeyRotatedAt: Date | null;
}

/**
 * Service authentication result
 */
export interface ServiceAuthResult {
  authenticated: boolean;
  service?: ServiceRegistryEntry;
  error?: string;
}

/**
 * Create a new service in the registry
 * @param serviceIdentifier - Unique identifier for the service
 * @param apiKey - Plain text API key (will be hashed)
 * @param options - Additional service options
 * @returns The created service entry
 */
export async function createService(
  serviceIdentifier: string,
  apiKey: string,
  options?: {
    allowedScopes?: string[];
    description?: string;
    isActive?: boolean;
  }
): Promise<ServiceRegistryEntry> {
  // Hash the API key
  const hashedApiKey = await bcrypt.hash(apiKey, BCRYPT_ROUNDS);
  
  logger.info({ serviceIdentifier }, 'Creating new service in registry');
  
  const service = await prisma.serviceRegistry.create({
    data: {
      serviceIdentifier,
      hashedApiKey,
      allowedScopes: options?.allowedScopes || [],
      description: options?.description || null,
      isActive: options?.isActive !== undefined ? options.isActive : true,
    },
  });
  
  logger.info({ serviceId: service.id, serviceIdentifier }, 'Service created successfully');
  
  return {
    id: service.id,
    serviceIdentifier: service.serviceIdentifier,
    allowedScopes: service.allowedScopes,
    isActive: service.isActive,
    description: service.description,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    lastUsedAt: service.lastUsedAt,
    lastApiKeyRotatedAt: service.lastApiKeyRotatedAt,
  };
}

/**
 * Authenticate a service by verifying its API key
 * @param serviceIdentifier - Service identifier
 * @param apiKey - Plain text API key to verify
 * @returns Authentication result
 */
export async function authenticateService(
  serviceIdentifier: string,
  apiKey: string
): Promise<ServiceAuthResult> {
  try {
    // Find the service
    const service = await prisma.serviceRegistry.findUnique({
      where: { serviceIdentifier },
    });
    
    if (!service) {
      logger.debug({ serviceIdentifier }, 'Service not found in registry');
      return {
        authenticated: false,
        error: 'Service not found',
      };
    }
    
    // Check if service is active
    if (!service.isActive) {
      logger.warn({ serviceIdentifier }, 'Inactive service attempted authentication');
      return {
        authenticated: false,
        error: 'Service is inactive',
      };
    }
    
    // Verify API key
    const isValid = await bcrypt.compare(apiKey, service.hashedApiKey);
    
    if (!isValid) {
      logger.warn({ serviceIdentifier }, 'Service authentication failed: invalid API key');
      return {
        authenticated: false,
        error: 'Invalid API key',
      };
    }
    
    // Update last used timestamp
    await prisma.serviceRegistry.update({
      where: { id: service.id },
      data: { lastUsedAt: new Date() },
    });
    
    logger.info({ serviceId: service.id, serviceIdentifier }, 'Service authenticated successfully');
    
    return {
      authenticated: true,
      service: {
        id: service.id,
        serviceIdentifier: service.serviceIdentifier,
        allowedScopes: service.allowedScopes,
        isActive: service.isActive,
        description: service.description,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
        lastUsedAt: service.lastUsedAt,
        lastApiKeyRotatedAt: service.lastApiKeyRotatedAt,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ serviceIdentifier, errorMessage }, 'Error authenticating service');
    return {
      authenticated: false,
      error: 'Authentication error',
    };
  }
}

/**
 * Get a service by identifier
 * @param serviceIdentifier - Service identifier
 * @returns Service entry or null
 */
export async function getService(
  serviceIdentifier: string
): Promise<ServiceRegistryEntry | null> {
  const service = await prisma.serviceRegistry.findUnique({
    where: { serviceIdentifier },
  });
  
  if (!service) {
    return null;
  }
  
  return {
    id: service.id,
    serviceIdentifier: service.serviceIdentifier,
    allowedScopes: service.allowedScopes,
    isActive: service.isActive,
    description: service.description,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    lastUsedAt: service.lastUsedAt,
    lastApiKeyRotatedAt: service.lastApiKeyRotatedAt,
  };
}

/**
 * Update a service's API key
 * @param serviceIdentifier - Service identifier
 * @param newApiKey - New plain text API key (will be hashed)
 */
export async function rotateServiceApiKey(
  serviceIdentifier: string,
  newApiKey: string
): Promise<void> {
  const hashedApiKey = await bcrypt.hash(newApiKey, BCRYPT_ROUNDS);
  const now = new Date();
  
  await prisma.serviceRegistry.update({
    where: { serviceIdentifier },
    data: { 
      hashedApiKey,
      lastApiKeyRotatedAt: now,
    },
  });
  
  logger.info({ serviceIdentifier, rotatedAt: now }, 'Service API key rotated successfully');
}

/**
 * Deactivate a service (soft delete)
 * @param serviceIdentifier - Service identifier
 */
export async function deactivateService(serviceIdentifier: string): Promise<void> {
  await prisma.serviceRegistry.update({
    where: { serviceIdentifier },
    data: { isActive: false },
  });
  
  logger.info({ serviceIdentifier }, 'Service deactivated');
}

/**
 * Activate a service
 * @param serviceIdentifier - Service identifier
 */
export async function activateService(serviceIdentifier: string): Promise<void> {
  await prisma.serviceRegistry.update({
    where: { serviceIdentifier },
    data: { isActive: true },
  });
  
  logger.info({ serviceIdentifier }, 'Service activated');
}

/**
 * Delete a service permanently
 * @param serviceIdentifier - Service identifier
 */
export async function deleteService(serviceIdentifier: string): Promise<void> {
  await prisma.serviceRegistry.delete({
    where: { serviceIdentifier },
  });
  
  logger.info({ serviceIdentifier }, 'Service deleted permanently');
}

/**
 * List all services
 * @param activeOnly - Only return active services
 * @returns Array of service entries
 */
export async function listServices(activeOnly = false): Promise<ServiceRegistryEntry[]> {
  const services = await prisma.serviceRegistry.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  
  return services.map((service) => ({
    id: service.id,
    serviceIdentifier: service.serviceIdentifier,
    allowedScopes: service.allowedScopes,
    isActive: service.isActive,
    description: service.description,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    lastUsedAt: service.lastUsedAt,
    lastApiKeyRotatedAt: service.lastApiKeyRotatedAt,
  }));
}

/**
 * Log a service access attempt
 * @param serviceId - Service ID
 * @param userId - User ID whose token was requested
 * @param action - Action performed
 * @param success - Whether the request was successful
 * @param options - Additional audit log options
 */
export async function logServiceAccess(
  serviceId: string,
  userId: string,
  action: string,
  success: boolean,
  options?: {
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    await prisma.serviceAuditLog.create({
      data: {
        serviceId,
        userId,
        action,
        success,
        errorMessage: options?.errorMessage || null,
        ipAddress: options?.ipAddress || null,
        userAgent: options?.userAgent || null,
      },
    });
    
    logger.debug(
      { serviceId, userId, action, success },
      'Service access logged'
    );
  } catch (error) {
    // Log error but don't fail the request
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ serviceId, userId, action, errorMessage }, 'Failed to log service access');
  }
}
