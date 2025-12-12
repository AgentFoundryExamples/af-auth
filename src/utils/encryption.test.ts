// Mock logger before any imports
jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config before importing encryption
jest.mock('../config', () => ({
  config: {
    github: {
      tokenEncryptionKey: 'test-encryption-key-at-least-32-characters-long-for-security',
    },
  },
}));

import { encrypt, decrypt, encryptGitHubToken, decryptGitHubToken } from './encryption';

describe('Encryption Utilities', () => {
  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string correctly', async () => {
      const plaintext = 'my-secret-github-token';
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for the same plaintext', async () => {
      const plaintext = 'my-secret-github-token';
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);
      
      // Different because of random IV and salt
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same value
      expect(await decrypt(encrypted1)).toBe(plaintext);
      expect(await decrypt(encrypted2)).toBe(plaintext);
    });

    it('should encrypt and decrypt long strings', async () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt strings with special characters', async () => {
      const plaintext = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./\n\t\r';
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when decrypting invalid data', async () => {
      await expect(decrypt('invalid-encrypted-data')).rejects.toThrow('Decryption failed');
    });

    it('should throw error when decrypting tampered data', async () => {
      const plaintext = 'my-secret-token';
      const encrypted = await encrypt(plaintext);
      
      // Tamper with the encrypted data
      const tampered = encrypted + 'extra';
      
      await expect(decrypt(tampered)).rejects.toThrow('Decryption failed');
    });

    it('should produce encrypted data with correct format', async () => {
      const plaintext = 'test-token';
      const encrypted = await encrypt(plaintext);
      
      // Should have 4 parts separated by colons
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(4);
      
      // Each part should be valid base64
      parts.forEach(part => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });
  });

  describe('encryptGitHubToken and decryptGitHubToken', () => {
    it('should encrypt and decrypt a GitHub token', async () => {
      const token = 'gho_1234567890abcdefghijklmnopqrstuvwxyz';
      const encrypted = await encryptGitHubToken(token);
      const decrypted = await decryptGitHubToken(encrypted);
      
      expect(decrypted).toBe(token);
    });

    it('should handle null tokens', async () => {
      expect(await encryptGitHubToken(null)).toBeNull();
      expect(await decryptGitHubToken(null)).toBeNull();
    });

    it('should handle empty string by encrypting it', async () => {
      const encrypted = await encryptGitHubToken('');
      const decrypted = await decryptGitHubToken(encrypted);
      
      // Empty string should be encrypted like any other string
      expect(encrypted).not.toBeNull();
      expect(decrypted).toBe('');
    });
  });

  describe('security properties', () => {
    it('should use different salts for each encryption', async () => {
      const plaintext = 'test';
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);
      
      const salt1 = encrypted1.split(':')[0];
      const salt2 = encrypted2.split(':')[0];
      
      expect(salt1).not.toBe(salt2);
    });

    it('should use different IVs for each encryption', async () => {
      const plaintext = 'test';
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);
      
      const iv1 = encrypted1.split(':')[1];
      const iv2 = encrypted2.split(':')[1];
      
      expect(iv1).not.toBe(iv2);
    });
  });
});
