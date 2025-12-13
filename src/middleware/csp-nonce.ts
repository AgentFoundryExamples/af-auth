import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure nonce for CSP
 * @returns Base64-encoded nonce string
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Middleware to generate and attach CSP nonce to res.locals
 * Nonce is generated once per request and reused for all inline scripts/styles
 */
export function cspNonceMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Ensure res.locals exists
  if (!res.locals) {
    res.locals = {};
  }
  
  // Generate a single nonce for this request
  res.locals.cspNonce = generateNonce();
  next();
}
