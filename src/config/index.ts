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
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  github: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  session: {
    secret: string;
    maxAge: number;
  };
  ui: {
    adminContactEmail: string;
    adminContactName: string;
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
 * Centralized application configuration.
 * All configuration is loaded from environment variables with appropriate defaults.
 */

// Extract port and construct default base URL once
const port = getOptionalNumericEnv('PORT', 3000);
const defaultBaseUrl = `http://localhost:${port}`;

export const config: Config = {
  env: getOptionalEnv('NODE_ENV', 'development'),
  port,
  host: getOptionalEnv('HOST', '0.0.0.0'),
  baseUrl: getOptionalEnv('BASE_URL', defaultBaseUrl),
  database: {
    url: getRequiredEnv('DATABASE_URL'),
    pool: {
      min: getOptionalNumericEnv('DB_POOL_MIN', 2),
      max: getOptionalNumericEnv('DB_POOL_MAX', 10),
    },
    connectionTimeout: getOptionalNumericEnv('DB_CONNECTION_TIMEOUT_MS', 5000),
    maxRetries: getOptionalNumericEnv('DB_MAX_RETRIES', 3),
    retryDelay: getOptionalNumericEnv('DB_RETRY_DELAY_MS', 1000),
  },
  logging: {
    level: getOptionalEnv('LOG_LEVEL', 'info'),
    pretty: getOptionalBooleanEnv('LOG_PRETTY', process.env.NODE_ENV !== 'production'),
  },
  github: {
    clientId: getRequiredEnv('GITHUB_CLIENT_ID'),
    clientSecret: getRequiredEnv('GITHUB_CLIENT_SECRET'),
    callbackUrl: getOptionalEnv(
      'GITHUB_CALLBACK_URL',
      `${getOptionalEnv('BASE_URL', defaultBaseUrl)}/auth/github/callback`
    ),
  },
  session: {
    secret: getRequiredEnv('SESSION_SECRET'),
    maxAge: getOptionalNumericEnv('SESSION_MAX_AGE_MS', 600000), // 10 minutes default
  },
  ui: {
    adminContactEmail: getOptionalEnv('ADMIN_CONTACT_EMAIL', 'admin@example.com'),
    adminContactName: getOptionalEnv('ADMIN_CONTACT_NAME', 'Administrator'),
  },
};

export default config;
