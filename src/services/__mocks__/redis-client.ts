// Mock Redis client for testing
export const getRedisClient = jest.fn(() => ({
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  pipeline: jest.fn(() => ({
    get: jest.fn(),
    del: jest.fn(),
    exec: jest.fn(),
  })),
  status: 'ready',
}));

export const isRedisConnected = jest.fn(() => true);
export const getRedisStatus = jest.fn(() => 'ready');
export const disconnectRedis = jest.fn();
export const executeRedisOperation = jest.fn((operation) => operation());

export class RedisOperationError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    public readonly requestId?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'RedisOperationError';
  }
}
