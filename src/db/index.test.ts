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
import db from './index';

describe('Database Client', () => {
  // Integration tests can be run with RUN_INTEGRATION_TESTS=true for real database validation
  // By default, tests use mocked database operations to allow CI/local testing without infrastructure
  const shouldRunIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

  describe('Connection Management - Unit Tests', () => {
    let connectSpy: jest.SpyInstance;
    let disconnectSpy: jest.SpyInstance;
    let queryRawSpy: jest.SpyInstance;

    beforeEach(() => {
      // Mock the underlying prisma client methods
      connectSpy = jest.spyOn(db.prisma, '$connect').mockResolvedValue(undefined);
      disconnectSpy = jest.spyOn(db.prisma, '$disconnect').mockResolvedValue(undefined);
      queryRawSpy = jest.spyOn(db.prisma, '$queryRaw').mockResolvedValue([1]);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should have a prisma client instance', () => {
      expect(db.prisma).toBeDefined();
    });

    it('should call prisma.$connect when db.connect is invoked', async () => {
      await db.connect();
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    it('should call prisma.$disconnect when db.disconnect is invoked', async () => {
      // First connect to set the state, then disconnect
      await db.connect();
      await db.disconnect();
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });

    it('should call prisma.$queryRaw when db.healthCheck is invoked', async () => {
      await db.healthCheck();
      expect(queryRawSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Connection Management - Integration Tests', () => {
    // These tests require a real PostgreSQL database
    // Run with: RUN_INTEGRATION_TESTS=true npm test
    // See README.md Testing section for setup instructions

    beforeAll(async () => {
      if (shouldRunIntegrationTests && !db.connected) {
        await db.connect();
      }
    });

    afterAll(async () => {
      if (shouldRunIntegrationTests && db.connected) {
        await db.disconnect();
      }
    });

    (shouldRunIntegrationTests ? it : it.skip)('should connect to database', async () => {
      if (!db.connected) {
        await db.connect();
      }
      expect(db.connected).toBe(true);
    });

    (shouldRunIntegrationTests ? it : it.skip)('should perform health check', async () => {
      const healthy = await db.healthCheck();
      expect(healthy).toBe(true);
    });

    (shouldRunIntegrationTests ? it : it.skip)('should handle disconnect', async () => {
      if (db.connected) {
        await db.disconnect();
        expect(db.connected).toBe(false);
        // Reconnect for other tests
        await db.connect();
      }
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      // Ensure the db is disconnected before each test in this block.
      if (db.connected) {
        await db.disconnect();
      }
    });

    it('should return false for a health check when not connected', async () => {
      // This test ensures that a health check on a closed connection
      // correctly returns false without throwing an error.
      const healthy = await db.healthCheck();
      expect(healthy).toBe(false);
    });
  });
});
