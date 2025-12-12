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
import request from 'supertest';
import { app } from '../server';
import { prisma } from '../db';
import * as githubOAuth from '../services/github-oauth';

// Mock the GitHub OAuth service
jest.mock('../services/github-oauth');

const mockGitHubOAuth = githubOAuth as jest.Mocked<typeof githubOAuth>;

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /auth/github', () => {
    it('should render login page with auth URL', async () => {
      mockGitHubOAuth.generateState.mockReturnValue('test-state-token');
      mockGitHubOAuth.getAuthorizationUrl.mockReturnValue('https://github.com/login/oauth/authorize?test');

      const response = await request(app)
        .get('/auth/github')
        .expect(200)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('Sign in with GitHub');
      expect(response.text).toContain('https://github.com/login/oauth/authorize?test');
    });

    it('should handle errors gracefully', async () => {
      mockGitHubOAuth.generateState.mockImplementation(() => {
        throw new Error('State generation failed');
      });

      const response = await request(app)
        .get('/auth/github')
        .expect(500)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('Authentication Error');
    });
  });

  describe('GET /auth/github/callback', () => {
    it('should reject callback with missing code', async () => {
      const response = await request(app)
        .get('/auth/github/callback')
        .query({ state: 'test-state' })
        .expect(400)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('Invalid Request');
      expect(response.text).toContain('Missing authorization code');
    });

    it('should reject callback with missing state', async () => {
      const response = await request(app)
        .get('/auth/github/callback')
        .query({ code: 'test-code' })
        .expect(400)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('Invalid Request');
      expect(response.text).toContain('Missing state parameter');
    });

    it('should reject callback with invalid state', async () => {
      mockGitHubOAuth.validateState.mockReturnValue(false);

      const response = await request(app)
        .get('/auth/github/callback')
        .query({ code: 'test-code', state: 'invalid-state' })
        .expect(400)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('Security Error');
      expect(response.text).toContain('Invalid or expired authentication session');
    });

    it('should handle GitHub OAuth errors', async () => {
      const response = await request(app)
        .get('/auth/github/callback')
        .query({
          error: 'access_denied',
          error_description: 'User denied access',
          state: 'test-state',
        })
        .expect(400)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('Authentication Failed');
      expect(response.text).toContain('User denied access');
    });

    it('should show unauthorized page for non-whitelisted user', async () => {
      mockGitHubOAuth.validateState.mockReturnValue(true);
      mockGitHubOAuth.exchangeCodeForToken.mockResolvedValue({
        access_token: 'test-token',
        token_type: 'bearer',
        scope: 'user:email',
      });
      mockGitHubOAuth.getGitHubUser.mockResolvedValue({
        id: 12345,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      });
      mockGitHubOAuth.calculateTokenExpiration.mockReturnValue(null);

      // Mock Prisma upsert to return non-whitelisted user
      const mockUser = {
        id: 'user-uuid',
        githubUserId: BigInt(12345),
        githubAccessToken: 'test-token',
        githubRefreshToken: null,
        githubTokenExpiresAt: null,
        isWhitelisted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.user, 'upsert').mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/auth/github/callback')
        .query({ code: 'test-code', state: 'test-state' })
        .expect(200)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('Access Denied');
      expect(response.text).toContain('Need Access?');
    });

    it('should show token-ready page for whitelisted user', async () => {
      mockGitHubOAuth.validateState.mockReturnValue(true);
      mockGitHubOAuth.exchangeCodeForToken.mockResolvedValue({
        access_token: 'test-token',
        token_type: 'bearer',
        scope: 'user:email',
      });
      mockGitHubOAuth.getGitHubUser.mockResolvedValue({
        id: 12345,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      });
      mockGitHubOAuth.calculateTokenExpiration.mockReturnValue(null);

      // Mock Prisma upsert to return whitelisted user
      const mockUser = {
        id: 'user-uuid',
        githubUserId: BigInt(12345),
        githubAccessToken: 'test-token',
        githubRefreshToken: null,
        githubTokenExpiresAt: null,
        isWhitelisted: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.user, 'upsert').mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/auth/github/callback')
        .query({ code: 'test-code', state: 'test-state' })
        .expect(200)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('Authentication Successful');
      expect(response.text).toContain('JWT Token Ready');
      expect(response.text).toContain('testuser');
    });

    it('should handle token exchange errors', async () => {
      mockGitHubOAuth.validateState.mockReturnValue(true);
      mockGitHubOAuth.exchangeCodeForToken.mockRejectedValue(new Error('Token exchange failed'));

      const response = await request(app)
        .get('/auth/github/callback')
        .query({ code: 'test-code', state: 'test-state' })
        .expect(500)
        .expect('Content-Type', /html/);

      expect(response.text).toContain('Authentication Error');
      expect(response.text).toContain('An error occurred during authentication');
    });

    it('should create new user with isWhitelisted=false by default', async () => {
      mockGitHubOAuth.validateState.mockReturnValue(true);
      mockGitHubOAuth.exchangeCodeForToken.mockResolvedValue({
        access_token: 'test-token',
        token_type: 'bearer',
        scope: 'user:email',
      });
      mockGitHubOAuth.getGitHubUser.mockResolvedValue({
        id: 99999,
        login: 'newuser',
        email: 'new@example.com',
        name: 'New User',
        avatar_url: 'https://example.com/new-avatar.jpg',
      });
      mockGitHubOAuth.calculateTokenExpiration.mockReturnValue(null);

      const mockUpsert = jest.spyOn(prisma.user, 'upsert').mockResolvedValue({
        id: 'new-user-uuid',
        githubUserId: BigInt(99999),
        githubAccessToken: 'test-token',
        githubRefreshToken: null,
        githubTokenExpiresAt: null,
        isWhitelisted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app)
        .get('/auth/github/callback')
        .query({ code: 'test-code', state: 'test-state' })
        .expect(200);

      expect(mockUpsert).toHaveBeenCalledWith({
        where: {
          githubUserId: BigInt(99999),
        },
        update: expect.any(Object),
        create: expect.objectContaining({
          githubUserId: BigInt(99999),
          isWhitelisted: false,
        }),
      });
    });

    it('should update existing user tokens on repeat login', async () => {
      mockGitHubOAuth.validateState.mockReturnValue(true);
      mockGitHubOAuth.exchangeCodeForToken.mockResolvedValue({
        access_token: 'new-token',
        token_type: 'bearer',
        scope: 'user:email',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      });
      mockGitHubOAuth.getGitHubUser.mockResolvedValue({
        id: 12345,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      });

      const expirationDate = new Date(Date.now() + 3600000);
      mockGitHubOAuth.calculateTokenExpiration.mockReturnValue(expirationDate);

      const mockUpsert = jest.spyOn(prisma.user, 'upsert').mockResolvedValue({
        id: 'existing-user-uuid',
        githubUserId: BigInt(12345),
        githubAccessToken: 'new-token',
        githubRefreshToken: 'new-refresh-token',
        githubTokenExpiresAt: expirationDate,
        isWhitelisted: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date(),
      });

      await request(app)
        .get('/auth/github/callback')
        .query({ code: 'test-code', state: 'test-state' })
        .expect(200);

      expect(mockUpsert).toHaveBeenCalledWith({
        where: {
          githubUserId: BigInt(12345),
        },
        update: expect.objectContaining({
          githubAccessToken: 'new-token',
          githubRefreshToken: 'new-refresh-token',
          githubTokenExpiresAt: expirationDate,
        }),
        create: expect.any(Object),
      });
    });
  });
});
