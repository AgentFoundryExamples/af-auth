import crypto from 'crypto';
import { config } from '../config';
import logger from './logger';

/**
 * Encryption algorithm configuration
 * Using AES-256-GCM for authenticated encryption
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const SALT_LENGTH = 32; // 256 bits salt for key derivation

/**
 * Cache for derived keys to avoid expensive PBKDF2 operations on every encrypt/decrypt.
 * Maps: base64(salt) -> derived key Buffer
 * This cache is safe because:
 * 1. Each salt produces a unique key
 * 2. The master key (tokenEncryptionKey) doesn't change during runtime
 * 3. Memory usage is bounded by unique salts encountered
 */
const keyCache = new Map<string, Buffer>();

/**
 * Derives an encryption key from the master key using PBKDF2
 * Uses async implementation to prevent blocking the event loop
 * Results are cached by salt to improve performance
 */
async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
  const saltKey = salt.toString('base64');
  
  // Check cache first
  if (keyCache.has(saltKey)) {
    return keyCache.get(saltKey)!;
  }
  
  // Derive key asynchronously
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      masterKey,
      salt,
      100000, // iterations - provides strong security
      32, // key length (256 bits for AES-256)
      'sha256',
      (err, derivedKey) => {
        if (err) {
          return reject(err);
        }
        // Cache the result
        keyCache.set(saltKey, derivedKey);
        resolve(derivedKey);
      }
    );
  });
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 * Returns a base64-encoded string containing: salt:iv:authTag:ciphertext
 * 
 * @param plaintext - The text to encrypt
 * @returns Base64-encoded encrypted data with metadata
 */
export async function encrypt(plaintext: string): Promise<string> {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive encryption key
    const key = await deriveKey(config.github.tokenEncryptionKey, salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine all parts: salt:iv:authTag:ciphertext
    const result = [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted,
    ].join(':');
    
    logger.debug('Successfully encrypted data');
    
    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to encrypt data');
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypts a ciphertext string encrypted with encrypt()
 * Implements timing attack mitigation by performing consistent operations
 * 
 * @param encryptedData - Base64-encoded encrypted data with metadata (salt:iv:authTag:ciphertext)
 * @returns Decrypted plaintext string
 */
export async function decrypt(encryptedData: string): Promise<string> {
  try {
    // Split the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      // Timing attack mitigation: perform dummy key derivation even on format errors
      await deriveKey(config.github.tokenEncryptionKey, crypto.randomBytes(SALT_LENGTH));
      throw new Error('Invalid encrypted data format');
    }
    
    const [saltB64, ivB64, authTagB64, ciphertext] = parts;
    
    // Decode base64 components
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    
    // Derive the same encryption key
    const key = await deriveKey(config.github.tokenEncryptionKey, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    logger.debug('Successfully decrypted data');
    
    return decrypted;
  } catch (error) {
    logger.error({ error }, 'Failed to decrypt data');
    throw new Error('Decryption failed - data may be corrupted or key may be incorrect');
  }
}

/**
 * Encrypts a GitHub token for storage
 * Returns null if the input is null (to handle optional tokens)
 */
export async function encryptGitHubToken(token: string | null): Promise<string | null> {
  if (token === null) {
    return null;
  }
  return encrypt(token);
}

/**
 * Decrypts a GitHub token from storage
 * Returns null if the input is null (to handle optional tokens)
 */
export async function decryptGitHubToken(encryptedToken: string | null): Promise<string | null> {
  if (encryptedToken === null) {
    return null;
  }
  return decrypt(encryptedToken);
}
