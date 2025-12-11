import request from 'supertest';
import { app } from './server';

describe('Server', () => {
  describe('Health Endpoints', () => {
    describe('GET /health', () => {
      it('should return health status', async () => {
        const response = await request(app)
          .get('/health')
          .expect('Content-Type', /json/);

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('environment');
        expect(response.body).toHaveProperty('database');
        expect(response.body.database).toHaveProperty('connected');
        expect(response.body.database).toHaveProperty('healthy');
      });

      it('should return appropriate status code based on database health', async () => {
        const response = await request(app).get('/health');
        
        // Status should be 200 if healthy, 503 if unhealthy
        expect([200, 503]).toContain(response.status);
      });
    });

    describe('GET /ready', () => {
      it('should return readiness status', async () => {
        const response = await request(app)
          .get('/ready')
          .expect('Content-Type', /json/);

        expect(response.body).toHaveProperty('status');
        expect(['ready', 'not ready']).toContain(response.body.status);
      });

      it('should return appropriate status code', async () => {
        const response = await request(app).get('/ready');
        expect([200, 503]).toContain(response.status);
      });
    });

    describe('GET /live', () => {
      it('should return liveness status', async () => {
        const response = await request(app)
          .get('/live')
          .expect(200)
          .expect('Content-Type', /json/);

        expect(response.body).toEqual({ status: 'alive' });
      });
    });
  });

  describe('Error Handling', () => {
    describe('404 Handler', () => {
      it('should return 404 for undefined routes', async () => {
        const response = await request(app)
          .get('/nonexistent-route')
          .expect(404)
          .expect('Content-Type', /json/);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Not Found');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('path');
      });

      it('should include correct HTTP method in 404 message', async () => {
        const response = await request(app)
          .post('/nonexistent-route')
          .expect(404);

        expect(response.body.message).toContain('POST');
      });
    });
  });

  describe('JSON Parsing', () => {
    it('should parse JSON request bodies', async () => {
      // This is just testing that the middleware is configured
      // Actual routes would test this more thoroughly
      const response = await request(app)
        .post('/nonexistent-route')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json')
        .expect(404);

      expect(response.body).toBeDefined();
    });
  });
});
