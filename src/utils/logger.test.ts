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

      expect(result.username).toBe('testuser');
      expect(result.password).toBe('[REDACTED]');
      expect(result.email).toBe('test@example.com');
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
      expect(result.user.username).toBe('testuser');
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
      expect(result.profile.name).toBe('Test User');
      expect(result.profile.apiKey).toBe('[REDACTED]');
      expect(result.profile.settings.secret).toBe('[REDACTED]');
      expect(result.profile.settings.theme).toBe('dark');
      expect(result.sessions[0].id).toBe('sess1');
      expect(result.sessions[0].sessionId).toBe('[REDACTED]');
      expect(result.sessions[0].active).toBe(true);
    });
  });
});
