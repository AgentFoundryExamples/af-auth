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
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { config } from '../config';

/**
 * Security headers configuration
 * Configures Content-Security-Policy, HSTS, X-Frame-Options, etc.
 */
export interface SecurityHeadersConfig {
  contentSecurityPolicy: {
    enabled: boolean;
    directives: {
      defaultSrc: string[];
      scriptSrc: string[];
      styleSrc: string[];
      imgSrc: string[];
      connectSrc: string[];
      fontSrc: string[];
      objectSrc: string[];
      mediaSrc: string[];
      frameSrc: string[];
      formAction: string[];
      frameAncestors: string[];
      baseUri: string[];
      upgradeInsecureRequests: boolean;
    };
  };
  strictTransportSecurity: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  xFrameOptions: string;
  xContentTypeOptions: boolean;
  referrerPolicy: string;
  permissionsPolicy: {
    camera: string[];
    microphone: string[];
    geolocation: string[];
    payment: string[];
    usb: string[];
  };
}

/**
 * Get security headers configuration from environment variables
 * Provides sane defaults with configurable overrides
 * @param nonce Optional CSP nonce for inline scripts/styles
 */
function getSecurityHeadersConfig(nonce?: string): SecurityHeadersConfig {
  // Parse CSP directives from environment (comma-separated)
  const parseDirective = (envVar: string, defaultValue: string[]): string[] => {
    const value = process.env[envVar];
    if (!value) return defaultValue;
    const parsed = value.split(',').map(v => v.trim()).filter(v => v.length > 0);
    // If parsing resulted in empty array (e.g., whitespace only), use default
    return parsed.length > 0 ? parsed : defaultValue;
  };

  // Determine if we're in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Get GitHub OAuth callback URL domain for CSP allowlist
  const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL || config.github.callbackUrl;
  let githubDomain: string;
  try {
    githubDomain = new URL(githubCallbackUrl).origin;
  } catch (error) {
    console.error(
      'FATAL: Invalid GITHUB_CALLBACK_URL. Could not parse origin.',
      { url: githubCallbackUrl, error: error instanceof Error ? error.message : String(error) }
    );
    // Fallback to localhost for development, but log the error
    githubDomain = 'http://localhost:3000';
    console.warn(`Falling back to default GitHub domain: ${githubDomain}`);
  }

  // Check if CSP is disabled and warn
  const cspEnabled = process.env.CSP_ENABLED !== 'false'; // Enabled by default
  if (!cspEnabled) {
    console.warn(
      'WARNING: Content-Security-Policy is DISABLED via CSP_ENABLED=false. ' +
      'This significantly weakens protection against XSS attacks. ' +
      'CSP should NEVER be disabled in production environments.'
    );
  }

  return {
    contentSecurityPolicy: {
      enabled: cspEnabled,
      directives: {
        defaultSrc: parseDirective('CSP_DEFAULT_SRC', ["'self'"]),
        // Use nonce-based CSP for inline scripts and styles
        // Nonce is generated per request and passed to page components
        // If env var is set, add nonce to it; otherwise use defaults with nonce
        scriptSrc: (() => {
          const envValue = process.env.CSP_SCRIPT_SRC;
          if (envValue) {
            // If environment variable is set, parse it and add nonce if present
            const parsed = parseDirective('CSP_SCRIPT_SRC', []);
            return nonce ? [...parsed, `'nonce-${nonce}'`] : [...parsed, "'unsafe-inline'"];
          }
          // Use defaults with nonce or unsafe-inline
          return nonce ? ["'self'", `'nonce-${nonce}'`] : ["'self'", "'unsafe-inline'"];
        })(),
        styleSrc: (() => {
          const envValue = process.env.CSP_STYLE_SRC;
          if (envValue) {
            // If environment variable is set, parse it and add nonce if present
            const parsed = parseDirective('CSP_STYLE_SRC', []);
            return nonce ? [...parsed, `'nonce-${nonce}'`] : [...parsed, "'unsafe-inline'"];
          }
          // Use defaults with nonce or unsafe-inline
          return nonce ? ["'self'", `'nonce-${nonce}'`] : ["'self'", "'unsafe-inline'"];
        })(),
        imgSrc: parseDirective('CSP_IMG_SRC', ["'self'", 'data:', 'https:']),
        connectSrc: parseDirective('CSP_CONNECT_SRC', ["'self'", githubDomain, 'https://github.com']),
        fontSrc: parseDirective('CSP_FONT_SRC', ["'self'", 'data:']),
        objectSrc: parseDirective('CSP_OBJECT_SRC', ["'none'"]),
        mediaSrc: parseDirective('CSP_MEDIA_SRC', ["'self'"]),
        frameSrc: parseDirective('CSP_FRAME_SRC', ["'none'"]),
        formAction: parseDirective('CSP_FORM_ACTION', ["'self'", 'https://github.com']),
        frameAncestors: parseDirective('CSP_FRAME_ANCESTORS', ["'none'"]),
        baseUri: parseDirective('CSP_BASE_URI', ["'self'"]),
        upgradeInsecureRequests: process.env.CSP_UPGRADE_INSECURE_REQUESTS !== 'false' && isProduction,
      },
    },
    strictTransportSecurity: {
      enabled: process.env.HSTS_ENABLED !== 'false' && isProduction, // Disabled by default in dev
      maxAge: parseInt(process.env.HSTS_MAX_AGE || '31536000', 10), // 1 year default
      includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false',
      preload: process.env.HSTS_PRELOAD === 'true',
    },
    xFrameOptions: (() => {
      const value = (process.env.X_FRAME_OPTIONS || 'DENY').toUpperCase();
      if (value !== 'DENY' && value !== 'SAMEORIGIN') {
        console.warn(
          `Invalid X_FRAME_OPTIONS value: "${process.env.X_FRAME_OPTIONS}". ` +
          `Using default "DENY". Valid values are "DENY" or "SAMEORIGIN".`
        );
        return 'DENY';
      }
      return value;
    })(),
    xContentTypeOptions: process.env.X_CONTENT_TYPE_OPTIONS !== 'false', // Enabled by default
    referrerPolicy: process.env.REFERRER_POLICY || 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      camera: parseDirective('PERMISSIONS_POLICY_CAMERA', []),
      microphone: parseDirective('PERMISSIONS_POLICY_MICROPHONE', []),
      geolocation: parseDirective('PERMISSIONS_POLICY_GEOLOCATION', []),
      payment: parseDirective('PERMISSIONS_POLICY_PAYMENT', []),
      usb: parseDirective('PERMISSIONS_POLICY_USB', []),
    },
  };
}

/**
 * Convert permissions policy object to header string
 */
function buildPermissionsPolicyHeader(policy: SecurityHeadersConfig['permissionsPolicy']): string {
  const directives: string[] = [];
  
  Object.entries(policy).forEach(([feature, allowlist]) => {
    if (allowlist.length === 0) {
      directives.push(`${feature}=()`);
    } else {
      // 'self' should not be quoted in Permissions-Policy
      const values = allowlist.map(v => (v === 'self' ? 'self' : `"${v}"`)).join(' ');
      directives.push(`${feature}=(${values})`);
    }
  });

  return directives.join(', ');
}

/**
 * Create helmet middleware with configuration
 * Nonce-based CSP is automatically enabled when res.locals.cspNonce is available
 */
export function createSecurityHeadersMiddleware() {
  // Get static security config (without nonce) for non-CSP headers
  const staticConfig = getSecurityHeadersConfig();

  // Return middleware that applies helmet and custom Permissions-Policy header
  return (req: Request, res: Response, next: NextFunction) => {
    // Get nonce from res.locals if available (set by cspNonceMiddleware)
    let nonce = res.locals.cspNonce as string | undefined;
    
    // Validate nonce format to prevent header injection attacks
    // Base64 encoding can have 0-2 padding characters
    if (nonce && !/^[A-Za-z0-9+/]+=*$/.test(nonce)) {
      console.warn('Invalid nonce format detected, ignoring', { 
        nonceLength: nonce.length,
        noncePrefix: nonce.substring(0, 4)  // Log only prefix for security
      });
      nonce = undefined;
    }
    
    // Get security config with nonce
    const securityConfig = getSecurityHeadersConfig(nonce);
    
    // Build CSP directives for helmet
    const cspDirectives: Record<string, string[] | null> = {};
    if (securityConfig.contentSecurityPolicy.enabled) {
      Object.entries(securityConfig.contentSecurityPolicy.directives).forEach(([key, value]) => {
        if (key === 'upgradeInsecureRequests') {
          // upgrade-insecure-requests is included in helmet defaults
          // We need to explicitly disable it if not wanted
          if (value) {
            cspDirectives.upgradeInsecureRequests = [];
          } else {
            cspDirectives.upgradeInsecureRequests = null; // Explicitly disable
          }
        } else {
          // Convert camelCase to kebab-case for CSP directive names
          const directiveName = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
          const directiveValue = value as string[];
          
          // Validate directive value is not empty to prevent Helmet errors
          if (!Array.isArray(directiveValue) || directiveValue.length === 0) {
            console.warn(
              `CSP directive "${directiveName}" has empty or invalid value. Skipping directive.`,
              { directive: directiveName, value: directiveValue }
            );
            return; // Skip this directive
          }
          
          cspDirectives[directiveName] = directiveValue;
        }
      });
    }

    // Configure helmet with our security settings
    const helmetMiddleware = helmet({
      contentSecurityPolicy: securityConfig.contentSecurityPolicy.enabled
        ? {
            directives: cspDirectives,
          }
        : false,
      strictTransportSecurity: staticConfig.strictTransportSecurity.enabled
        ? {
            maxAge: staticConfig.strictTransportSecurity.maxAge,
            includeSubDomains: staticConfig.strictTransportSecurity.includeSubDomains,
            preload: staticConfig.strictTransportSecurity.preload,
          }
        : false,
      xFrameOptions: {
        action: staticConfig.xFrameOptions.toLowerCase() as 'deny' | 'sameorigin',
      },
      referrerPolicy: {
        policy: staticConfig.referrerPolicy as
          | 'no-referrer'
          | 'no-referrer-when-downgrade'
          | 'origin'
          | 'origin-when-cross-origin'
          | 'same-origin'
          | 'strict-origin'
          | 'strict-origin-when-cross-origin'
          | 'unsafe-url',
      },
      // Additional helmet defaults
      xContentTypeOptions: staticConfig.xContentTypeOptions,
      dnsPrefetchControl: { allow: false },
      xDownloadOptions: true,
      xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
    });

    // Apply helmet middleware
    helmetMiddleware(req, res, (err) => {
      if (err) {
        return next(err);
      }

      // Add Permissions-Policy header
      const permissionsPolicyHeader = buildPermissionsPolicyHeader(staticConfig.permissionsPolicy);
      if (permissionsPolicyHeader) {
        res.setHeader('Permissions-Policy', permissionsPolicyHeader);
      }

      next();
    });
  };
}

/**
 * Security headers middleware
 * Applies comprehensive security headers to all responses
 */
export const securityHeadersMiddleware = createSecurityHeadersMiddleware();
