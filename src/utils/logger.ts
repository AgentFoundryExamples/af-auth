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
import pino from 'pino';
import { config } from '../config';

/**
 * List of sensitive field names to redact from logs.
 * These patterns match common sensitive data field names.
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'githubAccessToken',
  'github_access_token',
  'githubRefreshToken',
  'github_refresh_token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'sessionId',
  'session_id',
  'ssn',
  'creditCard',
  'credit_card',
  'cvv',
];

/**
 * Recursively redacts sensitive fields from an object.
 * @param obj - The object to redact
 * @param visited - Set of visited objects to prevent circular references
 * @returns A new object with sensitive fields redacted
 */
function redactSensitiveData(obj: any, visited = new WeakSet()): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Prevent circular references
  if (visited.has(obj)) {
    return '[Circular]';
  }
  visited.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item, visited));
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    // Check if the key matches sensitive patterns with proper word boundaries
    // Matches: exact name, ends with _field, or is in camelCase/PascalCase ending with field
    const isSensitive = SENSITIVE_FIELDS.some(field => {
      const lowerField = field.toLowerCase();
      // Exact match
      if (lowerKey === lowerField) return true;
      // Ends with underscore + field (e.g., user_password, github_access_token)
      if (lowerKey.endsWith('_' + lowerField)) return true;
      // CamelCase/PascalCase pattern (e.g., userPassword, githubAccessToken)
      // Check if it ends with the field and there's a proper camelCase boundary
      if (lowerKey.endsWith(lowerField) && lowerKey.length > lowerField.length) {
        const prefixEndIndex = key.length - lowerField.length;
        // Get the original case at the boundary
        const boundaryChar = key[prefixEndIndex];
        // It's a camelCase boundary if the field part starts with uppercase
        // (e.g., userPassword has 'P', hasPassword has 'P')
        // but mypassword has 'p' (not camelCase)
        return boundaryChar === boundaryChar.toUpperCase() && boundaryChar !== boundaryChar.toLowerCase();
      }
      return false;
    });

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value, visited);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Custom serializer for redacting sensitive data.
 */
const serializers = {
  req: (req: any) => {
    return {
      id: req.id,
      method: req.method,
      url: req.url,
      query: redactSensitiveData(req.query),
      params: redactSensitiveData(req.params),
      headers: redactSensitiveData(req.headers),
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    };
  },
  res: (res: any) => {
    return {
      statusCode: res.statusCode,
      headers: redactSensitiveData(res.headers),
    };
  },
  err: pino.stdSerializers.err,
};

/**
 * Hook to redact sensitive data from all log entries.
 */
const hooks = {
  logMethod(inputArgs: any[], method: any) {
    if (inputArgs.length >= 2) {
      const arg = inputArgs[0];
      if (typeof arg === 'object') {
        inputArgs[0] = redactSensitiveData(arg);
      }
    }
    return method.apply(this, inputArgs);
  },
};

/**
 * Pino transport configuration.
 * In production, outputs JSON for Cloud Run.
 * In development, uses pretty printing if enabled.
 */
const transport = config.logging.pretty
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

/**
 * Base logger options.
 */
const baseOptions: pino.LoggerOptions = {
  level: config.logging.level,
  serializers,
  hooks,
  base: {
    env: config.env,
    ...(process.env.K_SERVICE && { service: process.env.K_SERVICE }),
    ...(process.env.K_REVISION && { revision: process.env.K_REVISION }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
};

/**
 * Create and configure the application logger.
 * - Structured JSON logging for production
 * - Pretty printing for development
 * - Automatic redaction of sensitive fields
 * - Cloud Run metadata injection
 */
export const logger = pino(
  transport ? { ...baseOptions, transport } : baseOptions
);

/**
 * Creates a child logger with additional context.
 * @param bindings - Additional fields to include in all log entries
 * @returns A child logger instance
 */
export function createLogger(bindings: Record<string, any>) {
  return logger.child(redactSensitiveData(bindings));
}

/**
 * Exported for testing purposes.
 */
export { redactSensitiveData };

export default logger;
