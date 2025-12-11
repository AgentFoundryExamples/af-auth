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
 * @returns A new object with sensitive fields redacted
 */
function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field => 
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value);
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
