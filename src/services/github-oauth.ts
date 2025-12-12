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
import { getRedisClient, executeRedisOperation } from './redis-client';

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
 * OAuth state with CSRF protection stored in Redis
 */
export interface OAuthState {
  state: string;
  timestamp: number;
  requestId: string;
}

/**
 * Generate a cryptographically secure random state token for CSRF protection
 * Stores state in Redis with TTL for multi-instance support
 */
export async function generateState(requestId?: string): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  const generatedRequestId = requestId || crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();

  const stateData: OAuthState = {
    state,
    timestamp,
    requestId: generatedRequestId,
  };

  await executeRedisOperation(
    async () => {
      const redis = getRedisClient();
      const key = `oauth:state:${state}`;
      const ttl = config.redis.stateTtlSeconds;

      await redis.setex(key, ttl, JSON.stringify(stateData));

      logger.debug(
        {
          stateLength: state.length,
          requestId: generatedRequestId,
          ttlSeconds: ttl,
        },
        'Generated OAuth state token and stored in Redis'
      );
    },
    'generateState',
    generatedRequestId
  );

  return state;
}

/**
 * Validate OAuth state token
 * Returns the OAuth state data if valid, null otherwise
 * Uses atomic get-and-delete to ensure one-time use
 */
export async function validateState(
  state: string,
  requestId?: string
): Promise<OAuthState | null> {
  try {
    const stateData = await executeRedisOperation(
      async () => {
        const redis = getRedisClient();
        const key = `oauth:state:${state}`;

        // Atomic get and delete (one-time use token)
        const pipeline = redis.pipeline();
        pipeline.get(key);
        pipeline.del(key);

        const results = await pipeline.exec();

        if (!results || results.length < 2) {
          logger.warn({ state, requestId }, 'OAuth state not found in Redis');
          return null;
        }

        const [getError, getValue] = results[0];
        if (getError || !getValue) {
          logger.warn(
            { state, requestId, error: getError },
            'OAuth state not found or expired'
          );
          return null;
        }

        const data = JSON.parse(getValue as string) as OAuthState;

        // Verify state hasn't expired
        const age = Date.now() - data.timestamp;
        const maxAge = config.redis.stateTtlSeconds * 1000;

        if (age > maxAge) {
          logger.warn(
            {
              state,
              requestId: data.requestId,
              age,
              maxAge,
            },
            'OAuth state expired'
          );
          return null;
        }

        logger.debug(
          { state, requestId: data.requestId },
          'OAuth state validated successfully'
        );

        return data;
      },
      'validateState',
      requestId
    );

    return stateData;
  } catch (error) {
    logger.error(
      { state, requestId, error },
      'Error validating OAuth state from Redis'
    );
    return null;
  }
}

/**
 * Get GitHub OAuth authorization URL for GitHub App installation
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    state,
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;

  logger.info({ state }, 'Generated GitHub App authorization URL');

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
