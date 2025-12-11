import { config } from '../config';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load default configuration values', () => {
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
    expect(config.database).toBeDefined();
    expect(config.database.pool).toBeDefined();
    expect(config.database.pool.min).toBeGreaterThanOrEqual(0);
    expect(config.database.pool.max).toBeGreaterThan(config.database.pool.min);
    expect(config.database.connectionTimeout).toBeGreaterThan(0);
    expect(config.database.maxRetries).toBeGreaterThan(0);
    expect(config.database.retryDelay).toBeGreaterThan(0);
  });

  it('should have correct logging configuration structure', () => {
    expect(config.logging).toBeDefined();
    expect(config.logging.level).toBeDefined();
    expect(typeof config.logging.pretty).toBe('boolean');
  });
});
