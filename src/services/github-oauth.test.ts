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
// Mock the logger first, before any imports
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the config module
jest.mock('../config', () => ({
  config: {
    github: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      callbackUrl: 'http://localhost:3000/auth/github/callback',
    },
    session: {
      maxAge: 600000, // 10 minutes
    },
    logging: {
      level: 'info',
      pretty: false,
    },
  },
}));

import {
  generateState,
  validateState,
  getAuthorizationUrl,
  calculateTokenExpiration,
} from './github-oauth';
import { config } from '../config';

describe('GitHub OAuth Service', () => {
  describe('generateState', () => {
    it('should generate a unique state token', () => {
      const state1 = generateState();
      const state2 = generateState();

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
      expect(state1.length).toBe(64); // 32 bytes * 2 (hex)
    });
  });

  describe('validateState', () => {
    it('should validate a recently generated state', () => {
      const state = generateState();
      const isValid = validateState(state);

      expect(isValid).toBe(true);
    });

    it('should reject an unknown state', () => {
      const isValid = validateState('unknown-state-token');

      expect(isValid).toBe(false);
    });

    it('should reject a state used twice (one-time use)', () => {
      const state = generateState();

      // First validation should succeed
      expect(validateState(state)).toBe(true);

      // Second validation should fail
      expect(validateState(state)).toBe(false);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct GitHub authorization URL', () => {
      const state = 'test-state-token';
      const url = getAuthorizationUrl(state);

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain(`client_id=${config.github.clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(config.github.callbackUrl)}`);
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('scope=user%3Aemail');
    });
  });

  describe('calculateTokenExpiration', () => {
    it('should calculate correct expiration date', () => {
      const expiresIn = 3600; // 1 hour
      const before = Date.now();
      const expiration = calculateTokenExpiration(expiresIn);
      const after = Date.now();

      expect(expiration).not.toBeNull();
      expect(expiration!.getTime()).toBeGreaterThanOrEqual(before + expiresIn * 1000);
      expect(expiration!.getTime()).toBeLessThanOrEqual(after + expiresIn * 1000);
    });

    it('should return null when expiresIn is not provided', () => {
      const expiration = calculateTokenExpiration(undefined);

      expect(expiration).toBeNull();
    });
  });
});
