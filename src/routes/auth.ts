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
import { Router, Request, Response } from 'express';
import ReactDOMServer from 'react-dom/server';
import React from 'react';
import { config } from '../config';
import logger from '../utils/logger';
import { prisma } from '../db';
import {
  generateState,
  validateState,
  getAuthorizationUrl,
  exchangeCodeForToken,
  getGitHubUser,
  calculateTokenExpiration,
} from '../services/github-oauth';
import { generateJWT } from '../services/jwt';
import { encryptGitHubToken } from '../utils/encryption';
import { LoginPage } from '../pages/login';
import { UnauthorizedPage } from '../pages/unauthorized';
import { TokenReadyPage } from '../pages/token-ready';
import { ErrorPage } from '../pages/error';

const router = Router();

/**
 * Render React component to HTML string
 */
function renderPage(component: React.ReactElement): string {
  return '<!DOCTYPE html>' + ReactDOMServer.renderToStaticMarkup(component);
}

/**
 * GET /auth/github
 * Initiates OAuth flow by redirecting to GitHub authorization page
 */
router.get('/github', async (_req: Request, res: Response) => {
  try {
    logger.info('Initiating GitHub OAuth flow');
    
    // Generate CSRF protection state token
    const state = await generateState();
    
    // Get GitHub authorization URL
    const authUrl = getAuthorizationUrl(state);
    
    // Render login page with auth URL
    const html = renderPage(
      React.createElement(LoginPage, {
        authUrl,
        serviceName: 'AF Auth',
      })
    );
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.error({ error }, 'Failed to initiate OAuth flow');
    
    const html = renderPage(
      React.createElement(ErrorPage, {
        title: 'Authentication Error',
        message: 'Failed to initiate authentication. Please try again.',
        serviceName: 'AF Auth',
      })
    );
    
    res.status(500).setHeader('Content-Type', 'text/html').send(html);
  }
});

/**
 * GET /auth/github/callback
 * Handles OAuth callback from GitHub
 */
router.get('/github/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;
  
  try {
    // Check for OAuth errors from GitHub
    if (error) {
      logger.warn({ error, error_description }, 'GitHub OAuth error');
      
      const html = renderPage(
        React.createElement(ErrorPage, {
          title: 'Authentication Failed',
          message: error_description as string || 'GitHub authentication was unsuccessful. Please try again.',
          serviceName: 'AF Auth',
        })
      );
      
      return res.status(400).setHeader('Content-Type', 'text/html').send(html);
    }
    
    // Validate required parameters
    if (!code || typeof code !== 'string') {
      logger.warn('Missing authorization code in callback');
      
      const html = renderPage(
        React.createElement(ErrorPage, {
          title: 'Invalid Request',
          message: 'Missing authorization code. Please try again.',
          serviceName: 'AF Auth',
        })
      );
      
      return res.status(400).setHeader('Content-Type', 'text/html').send(html);
    }
    
    if (!state || typeof state !== 'string') {
      logger.warn('Missing state parameter in callback');
      
      const html = renderPage(
        React.createElement(ErrorPage, {
          title: 'Invalid Request',
          message: 'Missing state parameter. Please try again.',
          serviceName: 'AF Auth',
        })
      );
      
      return res.status(400).setHeader('Content-Type', 'text/html').send(html);
    }
    
    // Validate state token (CSRF protection)
    const stateData = await validateState(state);
    if (!stateData) {
      logger.warn({ state }, 'Invalid or expired OAuth state');
      
      const html = renderPage(
        React.createElement(ErrorPage, {
          title: 'Security Error',
          message: 'Invalid or expired authentication session. Please try again.',
          serviceName: 'AF Auth',
        })
      );
      
      return res.status(400).setHeader('Content-Type', 'text/html').send(html);
    }
    
    logger.info('Processing GitHub OAuth callback');
    
    // Exchange code for access token
    const tokenResponse = await exchangeCodeForToken(code);
    
    // Get GitHub user information
    const githubUser = await getGitHubUser(tokenResponse.access_token);
    
    logger.info(
      { githubUserId: githubUser.id, githubLogin: githubUser.login },
      'Retrieved GitHub user information'
    );
    
    // Calculate token expiration
    const tokenExpiresAt = calculateTokenExpiration(tokenResponse.expires_in);
    
    // Encrypt tokens before storing
    const encryptedAccessToken = await encryptGitHubToken(tokenResponse.access_token);
    const encryptedRefreshToken = await encryptGitHubToken(tokenResponse.refresh_token || null);
    
    // Upsert user in database
    const user = await prisma.user.upsert({
      where: {
        githubUserId: BigInt(githubUser.id),
      },
      update: {
        githubAccessToken: encryptedAccessToken,
        githubRefreshToken: encryptedRefreshToken,
        githubTokenExpiresAt: tokenExpiresAt,
        updatedAt: new Date(),
      },
      create: {
        githubUserId: BigInt(githubUser.id),
        githubAccessToken: encryptedAccessToken,
        githubRefreshToken: encryptedRefreshToken,
        githubTokenExpiresAt: tokenExpiresAt,
        isWhitelisted: false, // Default to not whitelisted
      },
    });
    
    logger.info(
      {
        userId: user.id,
        githubUserId: user.githubUserId.toString(),
        isWhitelisted: user.isWhitelisted,
      },
      'User upserted successfully'
    );
    
    // Check whitelist status and render appropriate page
    if (user.isWhitelisted) {
      logger.info({ userId: user.id }, 'User is whitelisted, generating JWT and rendering token-ready page');
      
      // Generate JWT for the user
      let jwtToken: string | undefined;
      try {
        jwtToken = await generateJWT(user.id);
        logger.debug({ userId: user.id }, 'JWT generated successfully for whitelisted user');
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to generate JWT for whitelisted user');
        // Continue without token - user can still get it via API
      }
      
      const html = renderPage(
        React.createElement(TokenReadyPage, {
          userId: user.id,
          githubLogin: githubUser.login,
          serviceName: 'AF Auth',
          token: jwtToken,
        })
      );
      
      // Prevent caching of sensitive token information
      return res
        .setHeader('Content-Type', 'text/html')
        .setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        .setHeader('Pragma', 'no-cache')
        .setHeader('Expires', '0')
        .send(html);
    } else {
      logger.info({ userId: user.id }, 'User is not whitelisted, rendering unauthorized page');
      
      const html = renderPage(
        React.createElement(UnauthorizedPage, {
          adminContactEmail: config.ui.adminContactEmail,
          adminContactName: config.ui.adminContactName,
          serviceName: 'AF Auth',
        })
      );
      
      return res.setHeader('Content-Type', 'text/html').send(html);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to process OAuth callback');
    
    const html = renderPage(
      React.createElement(ErrorPage, {
        title: 'Authentication Error',
        message: 'An error occurred during authentication. Please try again.',
        serviceName: 'AF Auth',
      })
    );
    
    return res.status(500).setHeader('Content-Type', 'text/html').send(html);
  }
});

export default router;
