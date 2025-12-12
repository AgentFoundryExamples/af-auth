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
    expiresIn: getOptionalEnv('JWT_EXPIRES_IN', '30d'), // 30 days as per requirements
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
};

export default config;
