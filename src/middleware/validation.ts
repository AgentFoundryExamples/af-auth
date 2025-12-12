import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import logger from '../utils/logger';
import { randomUUID } from 'crypto';

/**
 * Sanitizes validation error details for logging.
 * Removes actual field values to prevent PII leakage.
 */
function sanitizeValidationError(error: ZodError): object {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
      // Do not include received value
    })),
  };
}

/**
 * Creates a validation middleware for request body validation.
 * Logs validation failures with sanitized payload snapshots.
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const requestId = randomUUID();
        logger.warn(
          {
            requestId,
            path: req.path,
            method: req.method,
            validationError: sanitizeValidationError(error),
          },
          'Request body validation failed'
        );
        
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          requestId,
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      
      // Unexpected error during validation
      const requestId = randomUUID();
      logger.error(
        {
          requestId,
          path: req.path,
          method: req.method,
          error,
        },
        'Unexpected error during validation'
      );
      
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      });
    }
  };
}

/**
 * Creates a validation middleware for query parameters.
 * 
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const requestId = randomUUID();
        logger.warn(
          {
            requestId,
            path: req.path,
            method: req.method,
            validationError: sanitizeValidationError(error),
          },
          'Query parameters validation failed'
        );
        
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          requestId,
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      
      // Unexpected error during validation
      const requestId = randomUUID();
      logger.error(
        {
          requestId,
          path: req.path,
          method: req.method,
          error,
        },
        'Unexpected error during validation'
      );
      
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      });
    }
  };
}

/**
 * Common validation schemas for reuse across routes.
 */
export const schemas = {
  // UUID validation
  uuid: z.string().uuid(),
  
  // GitHub user ID (numeric string)
  githubUserId: z.string().regex(/^\d+$/, 'Must be a numeric string'),
  
  // JWT token refresh request
  tokenRefresh: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
  
  // GitHub token request
  githubTokenRequest: z
    .object({
      userId: z.string().uuid().optional(),
      githubUserId: z.string().regex(/^\d+$/, 'Must be a numeric string').optional(),
    })
    .refine(
      (data) => data.userId || data.githubUserId,
      'Either userId or githubUserId must be provided'
    ),
  
  // Query parameters for token issuance
  tokenIssuanceQuery: z.object({
    userId: z.string().uuid(),
  }),
};

/**
 * Sanitizes input to prevent prototype pollution and injection attacks.
 * Recursively processes objects and arrays, removing dangerous properties.
 */
export function sanitizeInput(input: any): any {
  if (input === null || input === undefined) {
    return input;
  }
  
  if (typeof input !== 'object') {
    return input;
  }
  
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeInput(item));
  }
  
  // Remove dangerous property names
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(input)) {
    if (!dangerous.includes(key)) {
      sanitized[key] = sanitizeInput(value);
    }
  }
  
  return sanitized;
}

/**
 * Middleware to sanitize request body against prototype pollution.
 */
export function sanitizeRequestBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeInput(req.body);
  }
  next();
}
