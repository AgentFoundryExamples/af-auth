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
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'my-secret-github-token';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for the same plaintext', () => {
      const plaintext = 'my-secret-github-token';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      
      // Different because of random IV and salt
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should encrypt and decrypt long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt strings with special characters', () => {
      const plaintext = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./\n\t\r';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when decrypting invalid data', () => {
      expect(() => decrypt('invalid-encrypted-data')).toThrow('Decryption failed');
    });

    it('should throw error when decrypting tampered data', () => {
      const plaintext = 'my-secret-token';
      const encrypted = encrypt(plaintext);
      
      // Tamper with the encrypted data
      const tampered = encrypted + 'extra';
      
      expect(() => decrypt(tampered)).toThrow('Decryption failed');
    });

    it('should produce encrypted data with correct format', () => {
      const plaintext = 'test-token';
      const encrypted = encrypt(plaintext);
      
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
    it('should encrypt and decrypt a GitHub token', () => {
      const token = 'gho_1234567890abcdefghijklmnopqrstuvwxyz';
      const encrypted = encryptGitHubToken(token);
      const decrypted = decryptGitHubToken(encrypted);
      
      expect(decrypted).toBe(token);
    });

    it('should handle null tokens', () => {
      expect(encryptGitHubToken(null)).toBeNull();
      expect(decryptGitHubToken(null)).toBeNull();
    });

    it('should handle empty string', () => {
      const encrypted = encryptGitHubToken('');
      const decrypted = decryptGitHubToken(encrypted);
      
      expect(decrypted).toBe('');
    });
  });

  describe('security properties', () => {
    it('should use different salts for each encryption', () => {
      const plaintext = 'test';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      
      const salt1 = encrypted1.split(':')[0];
      const salt2 = encrypted2.split(':')[0];
      
      expect(salt1).not.toBe(salt2);
    });

    it('should use different IVs for each encryption', () => {
      const plaintext = 'test';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      
      const iv1 = encrypted1.split(':')[1];
      const iv2 = encrypted2.split(':')[1];
      
      expect(iv1).not.toBe(iv2);
    });
  });
});
