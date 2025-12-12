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
 */
function getSecurityHeadersConfig(): SecurityHeadersConfig {
  // Parse CSP directives from environment (comma-separated)
  const parseDirective = (envVar: string, defaultValue: string[]): string[] => {
    const value = process.env[envVar];
    if (!value) return defaultValue;
    return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
  };

  // Determine if we're in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Get GitHub OAuth callback URL domain for CSP allowlist
  const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL || config.github.callbackUrl;
  const githubDomain = new URL(githubCallbackUrl).origin;

  return {
    contentSecurityPolicy: {
      enabled: process.env.CSP_ENABLED !== 'false', // Enabled by default
      directives: {
        defaultSrc: parseDirective('CSP_DEFAULT_SRC', ["'self'"]),
        scriptSrc: parseDirective('CSP_SCRIPT_SRC', ["'self'", "'unsafe-inline'"]), // unsafe-inline needed for inline page scripts
        styleSrc: parseDirective('CSP_STYLE_SRC', ["'self'", "'unsafe-inline'"]), // unsafe-inline needed for inline page styles
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
    xFrameOptions: process.env.X_FRAME_OPTIONS || 'DENY',
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
      const values = allowlist.map(v => v === 'self' ? 'self' : `"${v}"`).join(' ');
      directives.push(`${feature}=(${values})`);
    }
  });

  return directives.join(', ');
}

/**
 * Create helmet middleware with configuration
 */
export function createSecurityHeadersMiddleware() {
  const securityConfig = getSecurityHeadersConfig();

  // Build CSP directives for helmet
  const cspDirectives: Record<string, string[] | boolean | null> = {};
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
        cspDirectives[directiveName] = value as string[];
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
    strictTransportSecurity: securityConfig.strictTransportSecurity.enabled
      ? {
          maxAge: securityConfig.strictTransportSecurity.maxAge,
          includeSubDomains: securityConfig.strictTransportSecurity.includeSubDomains,
          preload: securityConfig.strictTransportSecurity.preload,
        }
      : false,
    xFrameOptions: {
      action: securityConfig.xFrameOptions.toLowerCase() as 'deny' | 'sameorigin',
    },
    referrerPolicy: {
      policy: securityConfig.referrerPolicy as any,
    },
    // Additional helmet defaults
    xContentTypeOptions: securityConfig.xContentTypeOptions,
    dnsPrefetchControl: { allow: false },
    xDownloadOptions: true,
    xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
  });

  // Return middleware that applies helmet and custom Permissions-Policy header
  return (req: Request, res: Response, next: NextFunction) => {
    // Apply helmet middleware
    helmetMiddleware(req, res, (err) => {
      if (err) {
        return next(err);
      }

      // Add Permissions-Policy header
      const permissionsPolicyHeader = buildPermissionsPolicyHeader(securityConfig.permissionsPolicy);
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
