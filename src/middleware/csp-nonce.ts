import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure nonce for CSP
 * @returns Base64-encoded nonce string, or undefined if generation fails
 */
export function generateNonce(): string | undefined {
  try {
    return randomBytes(16).toString('base64');
  } catch (error) {
    console.error('Failed to generate CSP nonce, falling back to unsafe-inline', { error });
    return undefined;
  }
}

/**
 * Middleware to generate and attach CSP nonce to res.locals
 * Nonce is generated once per request and reused for all inline scripts/styles
 */
export function cspNonceMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Generate a single nonce for this request
  // Note: res.locals is always initialized by Express as an empty object
  const nonce = generateNonce();
  if (nonce) {
    res.locals.cspNonce = nonce;
  }
  // If nonce generation fails, res.locals.cspNonce will be undefined
  // and security-headers middleware will fall back to unsafe-inline
  next();
}
