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

describe('Configuration', () => {
  const originalEnv = process.env;

  // Test JWT keys (base64-encoded PEM format)
  const testPrivateKeyPem = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
MzEfYyjiWA4R4/M2bS1+fWIcPm15j1JYi5s0Lm1JCOOdEf0vF9S7E8fGW8Bc9wYE
KNw98Y3JqFvfHwDQ7jkMqDN/w3tPzq4w8zZHbvFkVzTCqSQPNqS9WhUlTIxKh5M3
r8PqRJZWzg2Dq0Gn0cOQh0vV3eZOY7Y5zEF1qOq2Q0lME0LGF0wQ6TQW3t+N4Nh5
3p9LYS8h5lBGMqHr8NX3lW2pXMV8w7EfGH7N0vTKOTpEVQqP5JXdF9a8GQHZ8d4g
H5zKQN+JlLfqL4Y0r9HQKM3HcqtWy8L8Tv+1qNLwS3hQN8wPpPF0VKqDZH8vYZXm
PfGgAgMBAAECggEBAKdP0dqMtmJJ5bCOXdCb+hNJQO2dB8YwhIL3vbfP0nxOp3X8
gMHYdC6MNZcWPnQY3rVFHQEq7JLJDXB+CxcHiHqI6nYMeHl7xIWOCQV0dKzVmLgh
F3sY+c6s0PCPgYBPcwLRGH2vWj3QaLaRWQjK6rMnqYLbYs+8uU2+8qDx9eXCLT+n
vFJ8/FwP5cJ0z7U3F8xQY0gYNHR4KQXmW7w+ZwBSqPSCCLYb+TmN1UE1wW6X/qBl
KQcJLgLq8v0fNvLdNHQpDX7vFdCMqVF2MnqPYAGJGOqF7dKzMCPf0q9NKLqVHvQN
aHXBD3XvV9FqQKh7XF+kDCQYqQ7NqNBECgYEA6vC3QgNPZtLqB0N/sYqQ7F4qvLJ5
C3LQQ0Wq4p7Nq2VqQqN7dXLW3KQdp0YqLQpQnHdCjN/4c8DdP6YvQqYQ8Qf7mQ+8
U8r5HqGqCL4fF5wNT8f9KQR7D8YnXqvN9L8Q2fQ3T4wVqJ1LKqYqQ3NVd8Q8fQ2f
Q3Vd8Q8fQ2fQCgYEAy/1qQ7NqNBECgYEA6vC3QgNPZtLqB0N/sYqQ7F4qvLJ5C3LQ
Q0Wq4p7Nq2VqQqN7dXLW3KQdp0YqLQpQnHdCjN/4c8DdP6YvQqYQ8Qf7mQ+8U8r5
HqGqCL4fF5wNT8f9KQR7D8YnXqvN9L8Q2fQ3T4wVqJ1LKqYqQ3NVd8Q8fQ2fQ3Vd
8Q8fQ2fQCgYEAy/1qQ7NqNBECgYEA6vC3QgNPZtLqB0N/sYqQ7F4qvLJ5C3LQQ0Wq
4p7Nq2VqQqN7dXLW3KQdp0YqLQpQnHdCjN/4c8DdP6YvQqYQ8Qf7mQ+8U8r5HqGq
CL4fF5wNT8f9KQR7D8YnXqvN9L8Q2fQ3T4wVqJ1LKqYqQ3NVd8Q8fQ2fQ3Vd8Q8f
Q2fQ==
-----END PRIVATE KEY-----`;

  const testPublicKeyPem = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2Mo
4lgOEePzNm0tfn1iHD5teY9SWIubNC5tSQjjnRH9LxfUuxPHxlvAXPcGBCjcPfGN
yahb3x8A0O45DKgzf8N7T86uMPM2R27xZFc0wqkkDzakvVoVJUyMSoeQN6/D6kSW
Vs4Ng6tBp9HDkIdL1d3mTmO2OcxBdajqtkNJTBNCxhdMEOk0Ft7fjeDYed6fS2Ev
IeZQRjKh6/DV95VtqVzFfMOxHxh+zdL0yjk6RFUKj+SV3RfWvBkB2fHeIB+cykDf
iZS36i+GNK/R0CjNx3KrVsvC/E7/tajS8Et4UDfMD6TxdFSqg2R/L2GV5j3xoAID
AQAB
-----END PUBLIC KEY-----`;

  const testPrivateKeyB64 = Buffer.from(testPrivateKeyPem).toString('base64');
  const testPublicKeyB64 = Buffer.from(testPublicKeyPem).toString('base64');

  beforeEach(() => {
    jest.resetModules();
    process.env = { 
      ...originalEnv,
      // Set required environment variables for tests
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      GITHUB_CLIENT_ID: 'test_client_id',
      GITHUB_CLIENT_SECRET: 'test_client_secret',
      SESSION_SECRET: 'test_session_secret_at_least_32_chars',
      JWT_PRIVATE_KEY: testPrivateKeyB64,
      JWT_PUBLIC_KEY: testPublicKeyB64,
      GITHUB_TOKEN_ENCRYPTION_KEY: 'test_encryption_key_at_least_32_chars_long',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load default configuration values', () => {
    const { config } = require('../config');
    expect(config.env).toBeDefined();
    expect(config.port).toBeDefined();
    expect(config.host).toBeDefined();
  });

  it('should use default port if not specified', () => {
    delete process.env.PORT;
    const { config: newConfig } = require('../config');
    expect(newConfig.port).toBe(3000);
  });

  it('should parse numeric environment variables correctly', () => {
    process.env.PORT = '8080';
    process.env.DB_POOL_MIN = '5';
    process.env.DB_POOL_MAX = '20';
    
    jest.resetModules();
    const { config: newConfig } = require('../config');
    
    expect(newConfig.port).toBe(8080);
    expect(newConfig.database.pool.min).toBe(5);
    expect(newConfig.database.pool.max).toBe(20);
  });

  it('should parse boolean environment variables correctly', () => {
    process.env.LOG_PRETTY = 'true';
    jest.resetModules();
    const { config: newConfig } = require('../config');
    expect(newConfig.logging.pretty).toBe(true);

    process.env.LOG_PRETTY = 'false';
    jest.resetModules();
    const { config: newConfig2 } = require('../config');
    expect(newConfig2.logging.pretty).toBe(false);
  });

  it('should throw error for invalid numeric values', () => {
    process.env.PORT = 'invalid';
    jest.resetModules();
    
    expect(() => {
      require('../config');
    }).toThrow('Environment variable PORT must be a valid number');
  });

  it('should have correct database configuration structure', () => {
    const { config } = require('../config');
    expect(config.database).toBeDefined();
    expect(config.database.pool).toBeDefined();
    expect(config.database.pool.min).toBeGreaterThanOrEqual(0);
    expect(config.database.pool.max).toBeGreaterThan(config.database.pool.min);
    expect(config.database.connectionTimeout).toBeGreaterThan(0);
    expect(config.database.maxRetries).toBeGreaterThan(0);
    expect(config.database.retryDelay).toBeGreaterThan(0);
  });

  it('should have correct logging configuration structure', () => {
    const { config } = require('../config');
    expect(config.logging).toBeDefined();
    expect(config.logging.level).toBeDefined();
    expect(typeof config.logging.pretty).toBe('boolean');
  });

  it('should load JWT keys from environment variables', () => {
    const { config } = require('../config');
    expect(config.jwt.privateKey).toBeDefined();
    expect(config.jwt.publicKey).toBeDefined();
    expect(config.jwt.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    expect(config.jwt.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
  });

  it('should throw error when JWT_PRIVATE_KEY is missing', () => {
    delete process.env.JWT_PRIVATE_KEY;
    jest.resetModules();
    
    expect(() => {
      require('../config');
    }).toThrow('Missing required environment variable: JWT_PRIVATE_KEY');
  });

  it('should throw error when JWT_PUBLIC_KEY is missing', () => {
    delete process.env.JWT_PUBLIC_KEY;
    jest.resetModules();
    
    expect(() => {
      require('../config');
    }).toThrow('Missing required environment variable: JWT_PUBLIC_KEY');
  });

  it('should throw error when GITHUB_TOKEN_ENCRYPTION_KEY is missing', () => {
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    jest.resetModules();
    
    expect(() => {
      require('../config');
    }).toThrow('Missing required environment variable: GITHUB_TOKEN_ENCRYPTION_KEY');
  });

  it('should throw error when GITHUB_TOKEN_ENCRYPTION_KEY is too short', () => {
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = 'short';
    jest.resetModules();
    
    expect(() => {
      require('../config');
    }).toThrow('GITHUB_TOKEN_ENCRYPTION_KEY must be at least 32 characters long');
  });

  it('should throw error for invalid base64-encoded JWT keys', () => {
    process.env.JWT_PRIVATE_KEY = 'not-valid-base64!!!';
    jest.resetModules();
    
    expect(() => {
      require('../config');
    }).toThrow('JWT_PRIVATE_KEY must be a valid base64-encoded value');
  });

  it('should have database SSL configuration', () => {
    const { config } = require('../config');
    expect(config.database.ssl).toBeDefined();
    expect(typeof config.database.ssl.enabled).toBe('boolean');
    expect(typeof config.database.ssl.rejectUnauthorized).toBe('boolean');
  });

  it('should enable SSL by default in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DB_SSL_ENABLED;
    jest.resetModules();
    
    const { config } = require('../config');
    expect(config.database.ssl.enabled).toBe(true);
  });

  it('should disable SSL by default in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DB_SSL_ENABLED;
    jest.resetModules();
    
    const { config } = require('../config');
    expect(config.database.ssl.enabled).toBe(false);
  });

  it('should parse SSL certificate environment variables', () => {
    const testCert = 'test-certificate';
    process.env.DB_SSL_CA = Buffer.from(testCert).toString('base64');
    jest.resetModules();
    
    const { config } = require('../config');
    expect(config.database.ssl.ca).toBe(testCert);
  });

  it('should have GitHub token encryption key configured', () => {
    const { config } = require('../config');
    expect(config.github.tokenEncryptionKey).toBeDefined();
    expect(config.github.tokenEncryptionKey.length).toBeGreaterThanOrEqual(32);
  });
});

