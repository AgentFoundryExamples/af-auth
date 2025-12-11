import db from './index';

describe('Database Client', () => {
  // Note: These are integration tests that require a real database
  // They are skipped by default and should be run when DATABASE_URL is available
  const shouldRunIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

  describe('Connection Management', () => {
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

    it('should have a prisma client instance', () => {
      expect(db.prisma).toBeDefined();
    });

    it('should track connection state', () => {
      expect(typeof db.connected).toBe('boolean');
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
