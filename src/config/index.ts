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
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: require('path').resolve(process.cwd(), '.env') });

interface Config {
  env: string;
  port: number;
  host: string;
  baseUrl: string;
  database: {
    url: string;
    pool: {
      min: number;
      max: number;
    };
    connectionTimeout: number;
    maxRetries: number;
    retryDelay: number;
    ssl: {
      enabled: boolean;
      rejectUnauthorized: boolean;
      ca?: string;
      cert?: string;
      key?: string;
    };
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  github: {
    appId: string;
    installationId: string;
    privateKey: string;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    tokenEncryptionKey: string;
    tokenRefreshThresholdSeconds: number;
  };
  redis: {
    host: string;
    port: number;
    password: string | null;
    db: number;
    connectTimeout: number;
    maxRetries: number;
    retryDelay: number;
    maxRetriesPerRequest: number;
    stateTtlSeconds: number;
  };
  session: {
    secret: string;
    maxAge: number;
  };
  jwt: {
    privateKey: string;
    publicKey: string;
    expiresIn: string;
    issuer: string;
    audience: string;
    clockTolerance: number;
  };
  ui: {
    adminContactEmail: string;
    adminContactName: string;
  };
  rateLimit: {
    auth: {
      windowMs: number;
      maxRequests: number;
    };
    jwt: {
      windowMs: number;
      maxRequests: number;
    };
    githubToken: {
      windowMs: number;
      maxRequests: number;
    };
  };
  cookies: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
  };
  metrics: {
    enabled: boolean;
    prefix: string;
    namespace: string;
    collectDefaultMetrics: boolean;
    endpoint: string;
    authToken: string | null;
  };
}

/**
 * Retrieves a required environment variable.
 * Throws an error if the variable is not set or is an empty string.
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Retrieves an optional environment variable with a default value.
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Retrieves an optional numeric environment variable with a default value.
 */
function getOptionalNumericEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return parsed;
}

/**
 * Retrieves an optional boolean environment variable with a default value.
 */
function getOptionalBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

/**
 * Validates that a string is a valid base64-encoded value
 */
function validateBase64(value: string, name: string): void {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    if (!decoded || decoded.length === 0) {
      throw new Error(`${name} appears to be empty after base64 decoding`);
    }
  } catch (error) {
    // Preserve original error context for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`${name} must be a valid base64-encoded value: ${errorMessage}`);
  }
}

/**
 * Validates that a string has minimum length
 */
function validateMinLength(value: string, name: string, minLength: number): void {
  if (value.length < minLength) {
    throw new Error(
      `${name} must be at least ${minLength} characters long (current: ${value.length})`
    );
  }
}

/**
 * Decodes a base64-encoded PEM key from environment variable
 */
function getBase64DecodedKey(key: string, name: string): string {
  validateBase64(key, name);
  const decoded = Buffer.from(key, 'base64').toString('utf8');
  
  // Validate it looks like a PEM key
  if (!decoded.includes('-----BEGIN') || !decoded.includes('-----END')) {
    throw new Error(
      `${name} does not appear to be a valid PEM key after base64 decoding. ` +
      `Expected PEM format with BEGIN and END markers.`
    );
  }
  
  return decoded;
}

// JWT expiration format regex - matches formats like '30d', '7d', '24h', '60m', '3600s'
const JWT_EXPIRES_IN_REGEX = /^(\d+)([smhd])$/;

/**
 * Parse JWT expiration string to seconds
 * Supports formats: '30d', '7d', '24h', '60m', '3600s'
 */
function parseJWTExpiresInToSeconds(expiresIn: string): number {
  const match = expiresIn.match(JWT_EXPIRES_IN_REGEX);
  if (!match) {
    throw new Error(
      `Invalid JWT expiration format: "${expiresIn}". ` +
      `Expected format: number followed by unit (s=seconds, m=minutes, h=hours, d=days). ` +
      `Examples: "30d", "24h", "60m", "3600s"`
    );
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default:
      // This should never happen due to regex constraint
      throw new Error(`Unexpected time unit: ${unit}`);
  }
}

/**
 * Validates JWT expiration string format
 * Supports formats: '30d', '7d', '24h', '60m', '3600s'
 * @throws Error if format is invalid or value is out of acceptable range
 */
function validateJWTExpiresIn(expiresIn: string): void {
  // Parse to seconds (will throw if invalid format)
  let seconds: number;
  try {
    seconds = parseJWTExpiresInToSeconds(expiresIn);
  } catch (error) {
    throw error; // Re-throw parsing errors
  }
  
  // Validate value is positive
  if (seconds <= 0) {
    throw new Error(
      `JWT_EXPIRES_IN value must be positive (got: ${expiresIn} = ${seconds} seconds)`
    );
  }
  
  // Error for extremely short expirations (less than 60 seconds)
  if (seconds < 60) {
    throw new Error(
      `JWT_EXPIRES_IN is too short: ${expiresIn} (${seconds} seconds). ` +
      `Minimum allowed: 60s. Use at least 5m (5 minutes) for production.`
    );
  }
  
  // Warn for very short expirations (less than 5 minutes)
  if (seconds < 300) {
    console.warn(
      `WARNING: JWT_EXPIRES_IN is set to ${expiresIn} (${seconds} seconds). ` +
      `This is very short and may cause authentication issues. ` +
      `Minimum recommended: 5m (300 seconds).`
    );
  }
  
  // Warn for very long expirations (more than 1 year)
  if (seconds > 365 * 24 * 60 * 60) {
    console.warn(
      `WARNING: JWT_EXPIRES_IN is set to ${expiresIn} (${seconds} seconds, ~${Math.floor(seconds / (24 * 60 * 60))} days). ` +
      `This is unusually long and may pose security risks. ` +
      `Recommended maximum: 90d (90 days).`
    );
  }
}

/**
 * Centralized application configuration.
 * All configuration is loaded from environment variables with appropriate defaults.
 */

// Extract port and construct default base URL once
const port = getOptionalNumericEnv('PORT', 3000);
const defaultBaseUrl = `http://localhost:${port}`;
const baseUrl = getOptionalEnv('BASE_URL', defaultBaseUrl);

// Validate and load JWT keys from environment variables
// Keys must be base64-encoded PEM format for secure transmission via env vars
const jwtPrivateKeyB64 = getRequiredEnv('JWT_PRIVATE_KEY');
const jwtPublicKeyB64 = getRequiredEnv('JWT_PUBLIC_KEY');
const jwtPrivateKey = getBase64DecodedKey(jwtPrivateKeyB64, 'JWT_PRIVATE_KEY');
const jwtPublicKey = getBase64DecodedKey(jwtPublicKeyB64, 'JWT_PUBLIC_KEY');

// Validate and load GitHub token encryption key
const githubTokenEncryptionKey = getRequiredEnv('GITHUB_TOKEN_ENCRYPTION_KEY');
validateMinLength(githubTokenEncryptionKey, 'GITHUB_TOKEN_ENCRYPTION_KEY', 32);

// Validate JWT expiration format and range
const jwtExpiresIn = getOptionalEnv('JWT_EXPIRES_IN', '30d');
validateJWTExpiresIn(jwtExpiresIn);

// Database SSL configuration
const dbSslEnabled = getOptionalBooleanEnv('DB_SSL_ENABLED', process.env.NODE_ENV === 'production');
const dbSslRejectUnauthorized = getOptionalBooleanEnv('DB_SSL_REJECT_UNAUTHORIZED', true);
const dbSslCa = process.env.DB_SSL_CA; // Optional CA certificate (base64-encoded)
const dbSslCert = process.env.DB_SSL_CERT; // Optional client certificate (base64-encoded)
const dbSslKey = process.env.DB_SSL_KEY; // Optional client key (base64-encoded)

// Build database URL with SSL parameters if enabled
let databaseUrl = getRequiredEnv('DATABASE_URL');
if (dbSslEnabled) {
  const url = new URL(databaseUrl);
  
  // Add SSL mode parameter
  url.searchParams.set('sslmode', 'require');
  
  // Note: Prisma/PostgreSQL connection strings don't have a direct equivalent to 
  // Node's rejectUnauthorized option. SSL certificate validation is controlled by:
  // - sslmode=require: Requires SSL but doesn't verify certificates
  // - sslmode=verify-ca: Requires SSL and verifies the CA
  // - sslmode=verify-full: Requires SSL, verifies CA and hostname
  // The rejectUnauthorized config is stored for potential future use with custom
  // connection handlers or middleware.
  
  databaseUrl = url.toString();
}

export const config: Config = {
  env: getOptionalEnv('NODE_ENV', 'development'),
  port,
  host: getOptionalEnv('HOST', '0.0.0.0'),
  baseUrl,
  database: {
    url: databaseUrl,
    pool: {
      min: getOptionalNumericEnv('DB_POOL_MIN', 2),
      max: getOptionalNumericEnv('DB_POOL_MAX', 10),
    },
    connectionTimeout: getOptionalNumericEnv('DB_CONNECTION_TIMEOUT_MS', 5000),
    maxRetries: getOptionalNumericEnv('DB_MAX_RETRIES', 3),
    retryDelay: getOptionalNumericEnv('DB_RETRY_DELAY_MS', 1000),
    ssl: {
      enabled: dbSslEnabled,
      rejectUnauthorized: dbSslRejectUnauthorized,
      ca: dbSslCa ? Buffer.from(dbSslCa, 'base64').toString('utf8') : undefined,
      cert: dbSslCert ? Buffer.from(dbSslCert, 'base64').toString('utf8') : undefined,
      key: dbSslKey ? Buffer.from(dbSslKey, 'base64').toString('utf8') : undefined,
    },
  },
  logging: {
    level: getOptionalEnv('LOG_LEVEL', 'info'),
    pretty: getOptionalBooleanEnv('LOG_PRETTY', process.env.NODE_ENV !== 'production'),
  },
  github: {
    appId: getRequiredEnv('GITHUB_APP_ID'),
    installationId: getRequiredEnv('GITHUB_INSTALLATION_ID'),
    privateKey: (() => {
      const privateKeyB64 = getRequiredEnv('GITHUB_APP_PRIVATE_KEY');
      return getBase64DecodedKey(privateKeyB64, 'GITHUB_APP_PRIVATE_KEY');
    })(),
    clientId: getRequiredEnv('GITHUB_CLIENT_ID'),
    clientSecret: getRequiredEnv('GITHUB_CLIENT_SECRET'),
    callbackUrl: getOptionalEnv(
      'GITHUB_CALLBACK_URL',
      `${baseUrl}/auth/github/callback`
    ),
    tokenEncryptionKey: githubTokenEncryptionKey,
    tokenRefreshThresholdSeconds: (() => {
      const threshold = getOptionalNumericEnv('GITHUB_TOKEN_REFRESH_THRESHOLD_SECONDS', 3600);
      if (threshold < 300 || threshold > 7200) {
        throw new Error(
          `GITHUB_TOKEN_REFRESH_THRESHOLD_SECONDS must be between 300 and 7200 seconds (got ${threshold})`
        );
      }
      return threshold;
    })(),
  },
  redis: {
    host: getOptionalEnv('REDIS_HOST', 'localhost'),
    port: getOptionalNumericEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || null,
    db: getOptionalNumericEnv('REDIS_DB', 0),
    connectTimeout: getOptionalNumericEnv('REDIS_CONNECT_TIMEOUT_MS', 5000),
    maxRetries: getOptionalNumericEnv('REDIS_MAX_RETRIES', 3),
    retryDelay: getOptionalNumericEnv('REDIS_RETRY_DELAY_MS', 1000),
    maxRetriesPerRequest: getOptionalNumericEnv('REDIS_MAX_RETRIES_PER_REQUEST', 3),
    stateTtlSeconds: getOptionalNumericEnv('REDIS_STATE_TTL_SECONDS', 600), // 10 minutes default
  },
  session: {
    secret: getRequiredEnv('SESSION_SECRET'),
    maxAge: getOptionalNumericEnv('SESSION_MAX_AGE_MS', 600000), // 10 minutes default
  },
  jwt: {
    privateKey: jwtPrivateKey,
    publicKey: jwtPublicKey,
    expiresIn: jwtExpiresIn,
    issuer: getOptionalEnv('JWT_ISSUER', baseUrl),
    audience: getOptionalEnv('JWT_AUDIENCE', baseUrl),
    clockTolerance: getOptionalNumericEnv('JWT_CLOCK_TOLERANCE_SECONDS', 60), // 60 seconds tolerance
  },
  ui: {
    adminContactEmail: getOptionalEnv('ADMIN_CONTACT_EMAIL', 'admin@example.com'),
    adminContactName: getOptionalEnv('ADMIN_CONTACT_NAME', 'Administrator'),
  },
  rateLimit: {
    auth: {
      windowMs: getOptionalNumericEnv('RATE_LIMIT_AUTH_WINDOW_MS', 900000), // 15 minutes
      maxRequests: getOptionalNumericEnv('RATE_LIMIT_AUTH_MAX', 10), // 10 requests per window
    },
    jwt: {
      windowMs: getOptionalNumericEnv('RATE_LIMIT_JWT_WINDOW_MS', 900000), // 15 minutes
      maxRequests: getOptionalNumericEnv('RATE_LIMIT_JWT_MAX', 100), // 100 requests per window
    },
    githubToken: {
      windowMs: getOptionalNumericEnv('RATE_LIMIT_GITHUB_TOKEN_WINDOW_MS', 3600000), // 1 hour
      maxRequests: getOptionalNumericEnv('RATE_LIMIT_GITHUB_TOKEN_MAX', 1000), // 1000 requests per hour
    },
  },
  cookies: {
    httpOnly: getOptionalBooleanEnv('COOKIE_HTTP_ONLY', true),
    secure: getOptionalBooleanEnv('COOKIE_SECURE', process.env.NODE_ENV === 'production'),
    sameSite: (() => {
      const value = getOptionalEnv('COOKIE_SAME_SITE', 'strict');
      if (!['strict', 'lax', 'none'].includes(value)) {
        throw new Error(`Invalid COOKIE_SAME_SITE value: "${value}". Must be 'strict', 'lax', or 'none'.`);
      }
      return value as 'strict' | 'lax' | 'none';
    })(),
  },
  metrics: {
    enabled: getOptionalBooleanEnv('METRICS_ENABLED', true),
    prefix: getOptionalEnv('METRICS_PREFIX', 'af_auth_'),
    namespace: getOptionalEnv('METRICS_NAMESPACE', 'af_auth'),
    collectDefaultMetrics: getOptionalBooleanEnv('METRICS_COLLECT_DEFAULT', true),
    endpoint: getOptionalEnv('METRICS_ENDPOINT', '/metrics'),
    authToken: process.env.METRICS_AUTH_TOKEN || null,
  },
};

/**
 * Get JWT expiration time in seconds
 * Converts the configured expiration string to seconds
 */
export function getJWTExpirationSeconds(): number {
  return parseJWTExpiresInToSeconds(config.jwt.expiresIn);
}

/**
 * Calculate JWT expiration timestamp from current time
 * @returns Date object representing when a JWT issued now would expire
 */
export function calculateJWTExpiration(): Date {
  const seconds = getJWTExpirationSeconds();
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Get human-readable JWT expiration description
 * Examples: "30 days", "7 days", "24 hours", "60 minutes"
 */
export function getJWTExpirationDescription(): string {
  const expiresIn = config.jwt.expiresIn;
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  
  if (!match) {
    return expiresIn; // Fallback to raw value
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  const unitMap: Record<string, string> = {
    's': value === 1 ? 'second' : 'seconds',
    'm': value === 1 ? 'minute' : 'minutes',
    'h': value === 1 ? 'hour' : 'hours',
    'd': value === 1 ? 'day' : 'days',
  };
  
  return `${value} ${unitMap[unit] || unit}`;
}

export default config;
