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
import { redactSensitiveData } from './logger';

describe('Logger Redaction', () => {
  describe('redactSensitiveData', () => {
    it('should redact sensitive string fields', () => {
      const input = {
        username: 'testuser',
        password: 'secret123',
        email: 'test@example.com',
      };

      const result = redactSensitiveData(input);

      expect(result.username).toBe('[REDACTED]'); // Now redacted as PII
      expect(result.password).toBe('[REDACTED]');
      expect(result.email).toBe('[REDACTED]'); // Now redacted as PII
    });

    it('should redact access tokens', () => {
      const input = {
        accessToken: 'ghp_abc123',
        access_token: 'ghp_def456',
        githubAccessToken: 'ghp_ghi789',
        github_access_token: 'ghp_jkl012',
      };

      const result = redactSensitiveData(input);

      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.access_token).toBe('[REDACTED]');
      expect(result.githubAccessToken).toBe('[REDACTED]');
      expect(result.github_access_token).toBe('[REDACTED]');
    });

    it('should redact refresh tokens', () => {
      const input = {
        refreshToken: 'ghr_abc123',
        refresh_token: 'ghr_def456',
        githubRefreshToken: 'ghr_ghi789',
        github_refresh_token: 'ghr_jkl012',
      };

      const result = redactSensitiveData(input);

      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.refresh_token).toBe('[REDACTED]');
      expect(result.githubRefreshToken).toBe('[REDACTED]');
      expect(result.github_refresh_token).toBe('[REDACTED]');
    });

    it('should redact nested objects', () => {
      const input = {
        user: {
          id: 123,
          username: 'testuser',
          credentials: {
            password: 'secret',
            apiKey: 'key123',
          },
        },
      };

      const result = redactSensitiveData(input);

      expect(result.user.id).toBe(123);
      expect(result.user.username).toBe('[REDACTED]'); // Now redacted as PII
      expect(result.user.credentials.password).toBe('[REDACTED]');
      expect(result.user.credentials.apiKey).toBe('[REDACTED]');
    });

    it('should redact arrays with sensitive fields', () => {
      const input = {
        items: [
          { id: 'item1', apiKey: 'key123' },
          { id: 'item2', apiKey: 'key456' },
        ],
      };

      const result = redactSensitiveData(input);

      expect(result.items[0].id).toBe('item1');
      expect(result.items[0].apiKey).toBe('[REDACTED]');
      expect(result.items[1].id).toBe('item2');
      expect(result.items[1].apiKey).toBe('[REDACTED]');
    });

    it('should handle null and undefined values', () => {
      const input = {
        value1: null,
        value2: undefined,
        password: 'secret',
      };

      const result = redactSensitiveData(input);

      expect(result.value1).toBeNull();
      expect(result.value2).toBeUndefined();
      expect(result.password).toBe('[REDACTED]');
    });

    it('should handle primitive values', () => {
      expect(redactSensitiveData('string')).toBe('string');
      expect(redactSensitiveData(123)).toBe(123);
      expect(redactSensitiveData(true)).toBe(true);
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
    });

    it('should redact case-insensitive field names', () => {
      const input = {
        PASSWORD: 'secret1',
        Password: 'secret2',
        pAssWoRd: 'secret3',
        TOKEN: 'token1',
        Token: 'token2',
      };

      const result = redactSensitiveData(input);

      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.Password).toBe('[REDACTED]');
      expect(result.pAssWoRd).toBe('[REDACTED]');
      expect(result.TOKEN).toBe('[REDACTED]');
      expect(result.Token).toBe('[REDACTED]');
    });

    it('should redact authorization headers', () => {
      const input = {
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer abc123',
          cookie: 'session=xyz',
        },
      };

      const result = redactSensitiveData(input);

      expect(result.headers['content-type']).toBe('application/json');
      expect(result.headers.authorization).toBe('[REDACTED]');
      expect(result.headers.cookie).toBe('[REDACTED]');
    });

    it('should redact fields ending with sensitive words with proper boundaries', () => {
      const input = {
        password: 'secret',
        userPassword: 'secret123',
        user_password: 'secret456',
        passwordHint: 'hint123', // contains but not at camelCase boundary
        hasPassword: 'true', // has password but 'has' is not lowercase before 'Password'
        mypassword: 'secret789', // ends with 'password' but no boundary
        accessToken: 'token123',
        user_token: 'token456',
      };

      const result = redactSensitiveData(input);

      expect(result.password).toBe('[REDACTED]');
      expect(result.userPassword).toBe('[REDACTED]'); // camelCase boundary
      expect(result.user_password).toBe('[REDACTED]'); // underscore boundary
      expect(result.passwordHint).toBe('hint123'); // not a proper boundary
      expect(result.hasPassword).toBe('[REDACTED]'); // camelCase boundary (s->P)
      expect(result.mypassword).toBe('secret789'); // no boundary
      expect(result.accessToken).toBe('[REDACTED]'); // camelCase boundary
      expect(result.user_token).toBe('[REDACTED]'); // underscore boundary
    });

    it('should redact multiple sensitive fields in complex objects', () => {
      const input = {
        userId: 'user123',
        githubAccessToken: 'ghp_abc',
        githubRefreshToken: 'ghr_def',
        profile: {
          name: 'Test User',
          apiKey: 'key123',
          settings: {
            secret: 'supersecret',
            theme: 'dark',
          },
        },
        sessions: [
          { id: 'sess1', sessionId: 'abc', active: true },
          { id: 'sess2', sessionId: 'def', active: false },
        ],
      };

      const result = redactSensitiveData(input);

      expect(result.userId).toBe('user123');
      expect(result.githubAccessToken).toBe('[REDACTED]');
      expect(result.githubRefreshToken).toBe('[REDACTED]');
      expect(result.profile.name).toBe('[REDACTED]'); // Now redacted as PII
      expect(result.profile.apiKey).toBe('[REDACTED]');
      expect(result.profile.settings.secret).toBe('[REDACTED]');
      expect(result.profile.settings.theme).toBe('dark');
      expect(result.sessions[0].id).toBe('sess1');
      expect(result.sessions[0].sessionId).toBe('[REDACTED]');
      expect(result.sessions[0].active).toBe(true);
    });

    it('should redact PII fields', () => {
      const input = {
        email: 'user@example.com',
        name: 'John Doe',
        login: 'johndoe',
        username: 'johndoe123',
        firstName: 'John',
        first_name: 'John',
        lastName: 'Doe',
        last_name: 'Doe',
        fullName: 'John Doe',
        full_name: 'John Doe',
        phoneNumber: '555-1234',
        phone_number: '555-1234',
        userId: 'user123', // Should NOT be redacted
      };

      const result = redactSensitiveData(input);

      expect(result.email).toBe('[REDACTED]');
      expect(result.name).toBe('[REDACTED]');
      expect(result.login).toBe('[REDACTED]');
      expect(result.username).toBe('[REDACTED]');
      expect(result.firstName).toBe('[REDACTED]');
      expect(result.first_name).toBe('[REDACTED]');
      expect(result.lastName).toBe('[REDACTED]');
      expect(result.last_name).toBe('[REDACTED]');
      expect(result.fullName).toBe('[REDACTED]');
      expect(result.full_name).toBe('[REDACTED]');
      expect(result.phoneNumber).toBe('[REDACTED]');
      expect(result.phone_number).toBe('[REDACTED]');
      expect(result.userId).toBe('user123'); // Preserved
    });

    it('should redact address fields', () => {
      const input = {
        address: '123 Main St',
        street: 'Main St',
        city: 'Springfield',
        zipCode: '12345',
        zip_code: '12345',
        postalCode: '12345',
        postal_code: '12345',
      };

      const result = redactSensitiveData(input);

      expect(result.address).toBe('[REDACTED]');
      expect(result.street).toBe('[REDACTED]');
      expect(result.city).toBe('[REDACTED]');
      expect(result.zipCode).toBe('[REDACTED]');
      expect(result.zip_code).toBe('[REDACTED]');
      expect(result.postalCode).toBe('[REDACTED]');
      expect(result.postal_code).toBe('[REDACTED]');
    });

    it('should redact encryption and key fields', () => {
      const input = {
        privateKey: 'private-key-data',
        private_key: 'private-key-data',
        publicKey: 'public-key-data',
        public_key: 'public-key-data',
        encryptionKey: 'encryption-key',
        encryption_key: 'encryption-key',
        clientSecret: 'client-secret',
        client_secret: 'client-secret',
      };

      const result = redactSensitiveData(input);

      expect(result.privateKey).toBe('[REDACTED]');
      expect(result.private_key).toBe('[REDACTED]');
      expect(result.publicKey).toBe('[REDACTED]');
      expect(result.public_key).toBe('[REDACTED]');
      expect(result.encryptionKey).toBe('[REDACTED]');
      expect(result.encryption_key).toBe('[REDACTED]');
      expect(result.clientSecret).toBe('[REDACTED]');
      expect(result.client_secret).toBe('[REDACTED]');
    });

    it('should handle nested PII in GitHub user objects', () => {
      const input = {
        githubUser: {
          id: 12345,
          login: 'johndoe',
          name: 'John Doe',
          email: 'john@example.com',
          avatarUrl: 'https://avatar.url',
        },
        token: 'secret-token',
      };

      const result = redactSensitiveData(input);

      expect(result.githubUser.id).toBe(12345);
      expect(result.githubUser.login).toBe('[REDACTED]');
      expect(result.githubUser.name).toBe('[REDACTED]');
      expect(result.githubUser.email).toBe('[REDACTED]');
      expect(result.githubUser.avatarUrl).toBe('https://avatar.url');
      expect(result.token).toBe('[REDACTED]');
    });
  });
});
