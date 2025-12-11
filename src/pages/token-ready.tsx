import React from 'react';

export interface TokenReadyPageProps {
  userId: string;
  githubLogin: string;
  serviceName?: string;
}

/**
 * Token Ready page - shown to whitelisted users after successful authentication
 * This page confirms authentication and indicates that JWT tokens can be issued
 */
export const TokenReadyPage: React.FC<TokenReadyPageProps> = ({ 
  userId, 
  githubLogin,
  serviceName = 'AF Auth' 
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Authentication Successful - {serviceName}</title>
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
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
            max-width: 560px;
            width: 100%;
            padding: 48px;
            text-align: center;
          }
          
          .icon {
            font-size: 72px;
            margin-bottom: 24px;
            animation: checkmark 0.5s ease-in-out;
          }
          
          @keyframes checkmark {
            0% {
              transform: scale(0);
            }
            50% {
              transform: scale(1.2);
            }
            100% {
              transform: scale(1);
            }
          }
          
          h1 {
            color: #1a202c;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 16px;
          }
          
          .subtitle {
            color: #4a5568;
            font-size: 18px;
            line-height: 1.6;
            margin-bottom: 32px;
          }
          
          .user-info {
            background: #f7fafc;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 32px;
          }
          
          .user-info-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
          }
          
          .user-info-row:last-child {
            border-bottom: none;
          }
          
          .user-info-label {
            color: #718096;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .user-info-value {
            color: #2d3748;
            font-size: 16px;
            font-weight: 500;
            font-family: 'Monaco', 'Courier New', monospace;
          }
          
          .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #c6f6d5;
            color: #22543d;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 24px;
          }
          
          .status-dot {
            width: 8px;
            height: 8px;
            background: #22543d;
            border-radius: 50%;
            animation: pulse 2s infinite;
          }
          
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
          
          .info-box {
            background: #ebf8ff;
            border-left: 4px solid #3182ce;
            padding: 16px;
            margin-bottom: 24px;
            text-align: left;
          }
          
          .info-box p {
            color: #2c5282;
            font-size: 14px;
            line-height: 1.6;
          }
          
          .footer {
            color: #a0aec0;
            font-size: 14px;
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="icon">✅</div>
          <h1>Authentication Successful!</h1>
          <p className="subtitle">
            You've been successfully authenticated with GitHub and are authorized to use this service.
          </p>
          
          <div className="status-badge">
            <span className="status-dot"></span>
            Ready for Token Issuance
          </div>
          
          <div className="user-info">
            <div className="user-info-row">
              <span className="user-info-label">GitHub Username</span>
              <span className="user-info-value">{githubLogin}</span>
            </div>
            <div className="user-info-row">
              <span className="user-info-label">User ID</span>
              <span className="user-info-value">{userId}</span>
            </div>
          </div>
          
          <div className="info-box">
            <p>
              <strong>What's next?</strong> Your authentication has been verified and stored. 
              JWT tokens will be issued through the API endpoints for use with the CLI and other services.
            </p>
          </div>
          
          <p className="footer">
            This authentication session is secure and ready for token issuance.
          </p>
        </div>
      </body>
    </html>
  );
};
