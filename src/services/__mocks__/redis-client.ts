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
