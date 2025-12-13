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
    it('should have a prisma client instance', () => {
      expect(db.prisma).toBeDefined();
    });

    it('should track connection state', () => {
      expect(typeof db.connected).toBe('boolean');
    });

    it('should expose connect method', () => {
      expect(typeof db.connect).toBe('function');
    });

    it('should expose disconnect method', () => {
      expect(typeof db.disconnect).toBe('function');
    });

    it('should expose healthCheck method', () => {
      expect(typeof db.healthCheck).toBe('function');
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
    it('should not crash when health check fails with no connection', async () => {
      // This test assumes database is not available or connection is closed
      // It should return false, not throw
      const healthy = await db.healthCheck();
      expect(typeof healthy).toBe('boolean');
    });
  });
});
