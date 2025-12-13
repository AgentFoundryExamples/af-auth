import { Request, Response } from 'express';
import { generateNonce, cspNonceMiddleware } from './csp-nonce';

describe('CSP Nonce Middleware', () => {
  describe('generateNonce', () => {
    it('should generate a base64-encoded nonce', () => {
      const nonce = generateNonce();
      
      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);
      
      // Base64 encoded 16 bytes should be 24 characters (with padding)
      expect(nonce.length).toBe(24);
      
      // Should be valid base64
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should generate unique nonces on each call', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      const nonce3 = generateNonce();
      
      expect(nonce1).not.toBe(nonce2);
      expect(nonce2).not.toBe(nonce3);
      expect(nonce1).not.toBe(nonce3);
    });

    it('should generate cryptographically random nonces', () => {
      // Generate multiple nonces and check they don't follow patterns
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce());
      }
      
      // All should be unique
      expect(nonces.size).toBe(100);
    });
  });

  describe('cspNonceMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let nextFn: jest.Mock;

    beforeEach(() => {
      mockReq = {};
      mockRes = {
        locals: {},
      };
      nextFn = jest.fn();
    });

    it('should attach nonce to res.locals', () => {
      cspNonceMiddleware(mockReq as Request, mockRes as Response, nextFn);
      
      expect(mockRes.locals?.cspNonce).toBeDefined();
      expect(typeof mockRes.locals?.cspNonce).toBe('string');
      expect(mockRes.locals?.cspNonce.length).toBe(24);
    });

    it('should call next() after generating nonce', () => {
      cspNonceMiddleware(mockReq as Request, mockRes as Response, nextFn);
      
      expect(nextFn).toHaveBeenCalledTimes(1);
      expect(nextFn).toHaveBeenCalledWith();
    });

    it('should generate different nonces for different requests', () => {
      const mockRes1: Partial<Response> = { locals: {} };
      const mockRes2: Partial<Response> = { locals: {} };
      
      cspNonceMiddleware(mockReq as Request, mockRes1 as Response, nextFn);
      cspNonceMiddleware(mockReq as Request, mockRes2 as Response, nextFn);
      
      expect(mockRes1.locals?.cspNonce).toBeDefined();
      expect(mockRes2.locals?.cspNonce).toBeDefined();
      expect(mockRes1.locals?.cspNonce).not.toBe(mockRes2.locals?.cspNonce);
    });

    it('should not throw errors with empty res.locals', () => {
      mockRes.locals = undefined;
      
      expect(() => {
        cspNonceMiddleware(mockReq as Request, mockRes as Response, nextFn);
      }).not.toThrow();
      
      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('should overwrite existing cspNonce if present', () => {
      mockRes.locals = { cspNonce: 'old-nonce' };
      
      cspNonceMiddleware(mockReq as Request, mockRes as Response, nextFn);
      
      expect(mockRes.locals.cspNonce).toBeDefined();
      expect(mockRes.locals.cspNonce).not.toBe('old-nonce');
      expect(mockRes.locals.cspNonce.length).toBe(24);
    });
  });
});
