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
// Mock GitHub OAuth service for testing
export const generateState = jest.fn(async () => 'test-state-token');
export const validateState = jest.fn(async () => ({
  state: 'test-state',
  timestamp: Date.now(),
  requestId: 'test-request-id',
}));
export const getAuthorizationUrl = jest.fn(() => 'https://github.com/login/oauth/authorize?test');
export const exchangeCodeForToken = jest.fn(async () => ({
  access_token: 'test-token',
  token_type: 'bearer',
  scope: 'user:email',
}));
export const getGitHubUser = jest.fn(async () => ({
  id: 12345,
  login: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
}));
export const refreshAccessToken = jest.fn(async () => ({
  access_token: 'new-test-token',
  token_type: 'bearer',
  scope: 'user:email',
}));
export const isTokenExpiringSoon = jest.fn(() => false);
export const calculateTokenExpiration = jest.fn(() => null);

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}

export interface OAuthState {
  state: string;
  timestamp: number;
  requestId: string;
}
