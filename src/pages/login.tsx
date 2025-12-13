import React from 'react';

export interface LoginPageProps {
  authUrl: string;
  serviceName?: string;
  nonce?: string;
}

/**
 * Login/Signup page - prompts user to authenticate with GitHub
 */
export const LoginPage: React.FC<LoginPageProps> = ({ 
  authUrl, 
  serviceName = 'AF Auth',
  nonce 
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login - {serviceName}</title>
        <style nonce={nonce}>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          
          .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 480px;
            width: 100%;
            padding: 48px;
            text-align: center;
          }
          
          .logo {
            font-size: 48px;
            margin-bottom: 16px;
          }
          
          h1 {
            color: #1a202c;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 12px;
          }
          
          .subtitle {
            color: #718096;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 32px;
          }
          
          .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            background: #24292e;
            color: white;
            font-size: 16px;
            font-weight: 600;
            padding: 14px 32px;
            border: none;
            border-radius: 8px;
            text-decoration: none;
            transition: all 0.2s ease;
            cursor: pointer;
            width: 100%;
          }
          
          .button:hover {
            background: #1b1f23;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          }
          
          .button:active {
            transform: translateY(0);
          }
          
          .github-icon {
            width: 24px;
            height: 24px;
          }
          
          .footer {
            margin-top: 32px;
            color: #a0aec0;
            font-size: 14px;
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="logo">🔐</div>
          <h1>Welcome to {serviceName}</h1>
          <p className="subtitle">
            Sign in with your GitHub account to continue. You'll be redirected to GitHub to authorize this application.
          </p>
          <a href={authUrl} className="button">
            <svg className="github-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Sign in with GitHub
          </a>
          <p className="footer">
            Secure authentication powered by GitHub OAuth
          </p>
        </div>
      </body>
    </html>
  );
};
