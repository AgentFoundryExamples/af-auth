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
router.get('/github', (_req: Request, res: Response) => {
  try {
    logger.info('Initiating GitHub OAuth flow');
    
    // Generate CSRF protection state token
    const state = generateState();
    
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
    if (!validateState(state)) {
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
    
    // Upsert user in database
    const user = await prisma.user.upsert({
      where: {
        githubUserId: BigInt(githubUser.id),
      },
      update: {
        githubAccessToken: tokenResponse.access_token,
        githubRefreshToken: tokenResponse.refresh_token || null,
        githubTokenExpiresAt: tokenExpiresAt,
        updatedAt: new Date(),
      },
      create: {
        githubUserId: BigInt(githubUser.id),
        githubAccessToken: tokenResponse.access_token,
        githubRefreshToken: tokenResponse.refresh_token || null,
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
      logger.info({ userId: user.id }, 'User is whitelisted, rendering token-ready page');
      
      const html = renderPage(
        React.createElement(TokenReadyPage, {
          userId: user.id,
          githubLogin: githubUser.login,
          serviceName: 'AF Auth',
        })
      );
      
      return res.setHeader('Content-Type', 'text/html').send(html);
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
