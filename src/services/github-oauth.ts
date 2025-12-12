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
import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * GitHub OAuth token response
 */
export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

/**
 * GitHub user information
 */
export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}

/**
 * OAuth state with CSRF protection
 */
export interface OAuthState {
  state: string;
  timestamp: number;
}

/**
 * In-memory storage for OAuth states with expiration
 * 
 * PRODUCTION WARNING: This in-memory Map will NOT work correctly in multi-instance
 * deployments (e.g., Cloud Run auto-scaling, Kubernetes replicas). State tokens 
 * generated on one instance will not be accessible on another instance, causing
 * OAuth callback validation failures.
 * 
 * For production deployments with multiple instances, replace this with a distributed
 * cache such as:
 * - Redis with TTL support
 * - Memcached
 * - Cloud Memorystore (GCP)
 * - ElastiCache (AWS)
 * 
 * The distributed cache should:
 * 1. Store state tokens with automatic expiration (SESSION_MAX_AGE_MS)
 * 2. Support atomic delete operations for one-time use tokens
 * 3. Be accessible from all service instances
 * 
 * Example Redis implementation:
 * ```typescript
 * await redisClient.setex(`oauth:state:${state}`, SESSION_MAX_AGE_MS / 1000, Date.now().toString());
 * const timestamp = await redisClient.getdel(`oauth:state:${state}`); // Atomic get-and-delete
 * ```
 */
const oauthStates = new Map<string, number>();

/**
 * Clean up expired OAuth states (older than session max age)
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  const maxAge = config.session.maxAge;
  
  for (const [state, timestamp] of oauthStates.entries()) {
    if (now - timestamp > maxAge) {
      oauthStates.delete(state);
    }
  }
}

// Run cleanup every minute
// Use unref() to prevent this timer from keeping the process alive during tests
setInterval(cleanupExpiredStates, 60000).unref();

/**
 * Generate a cryptographically secure random state token for CSRF protection
 */
export function generateState(): string {
  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, Date.now());
  
  logger.debug({ stateLength: state.length }, 'Generated OAuth state token');
  
  return state;
}

/**
 * Validate OAuth state token
 * Returns true if valid, false otherwise
 */
export function validateState(state: string): boolean {
  const timestamp = oauthStates.get(state);
  
  if (!timestamp) {
    logger.warn({ state }, 'OAuth state not found');
    return false;
  }
  
  const age = Date.now() - timestamp;
  const maxAge = config.session.maxAge;
  
  if (age > maxAge) {
    logger.warn({ state, age, maxAge }, 'OAuth state expired');
    oauthStates.delete(state);
    return false;
  }
  
  // Remove state after successful validation (one-time use)
  oauthStates.delete(state);
  
  logger.debug({ state }, 'OAuth state validated successfully');
  return true;
}

/**
 * Get GitHub OAuth authorization URL
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    state,
    scope: 'user:email',
  });
  
  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
  
  logger.info({ state }, 'Generated GitHub OAuth authorization URL');
  
  return url;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<GitHubTokenResponse> {
  try {
    logger.info('Exchanging authorization code for access token');
    
    const response = await axios.post<GitHubTokenResponse>(
      'https://github.com/login/oauth/access_token',
      {
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );
    
    if (!response.data.access_token) {
      throw new Error('No access token in GitHub response');
    }
    
    logger.info('Successfully exchanged code for token');
    
    return response.data;
  } catch (error) {
    logger.error({ error }, 'Failed to exchange code for token');
    throw new Error('Failed to exchange authorization code for token');
  }
}

/**
 * Get GitHub user information using access token
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  try {
    logger.info('Fetching GitHub user information');
    
    const response = await axios.get<GitHubUser>(
      'https://api.github.com/user',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    
    logger.info({ githubUserId: response.data.id }, 'Successfully fetched GitHub user');
    
    return response.data;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch GitHub user information');
    throw new Error('Failed to fetch GitHub user information');
  }
}

/**
 * Refresh an expired GitHub access token using a refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GitHubTokenResponse> {
  try {
    logger.info('Refreshing GitHub access token');
    
    const response = await axios.post<GitHubTokenResponse>(
      'https://github.com/login/oauth/access_token',
      {
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );
    
    if (!response.data.access_token) {
      throw new Error('No access token in GitHub refresh response');
    }
    
    logger.info('Successfully refreshed access token');
    
    return response.data;
  } catch (error) {
    logger.error({ error }, 'Failed to refresh access token');
    throw new Error('Failed to refresh GitHub access token');
  }
}

/**
 * Check if a token is expired or will expire soon
 * @param expiresAt Token expiration date
 * @param thresholdSeconds Time in seconds before expiry to consider token as "expiring soon"
 * @returns true if token is expired or expiring soon, false otherwise
 */
export function isTokenExpiringSoon(
  expiresAt: Date | null,
  thresholdSeconds: number = 3600
): boolean {
  if (!expiresAt) {
    // If no expiration date, consider it as not expiring (legacy tokens)
    return false;
  }
  
  const now = Date.now();
  const expiryTime = expiresAt.getTime();
  const thresholdMs = thresholdSeconds * 1000;
  
  // Token is expiring soon if it expires within the threshold
  return (expiryTime - now) <= thresholdMs;
}

/**
 * Calculate token expiration date
 */
export function calculateTokenExpiration(expiresIn?: number): Date | null {
  if (!expiresIn) {
    return null;
  }
  
  return new Date(Date.now() + expiresIn * 1000);
}
