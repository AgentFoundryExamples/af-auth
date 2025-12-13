import React from 'react';

export interface UnauthorizedPageProps {
  adminContactEmail: string;
  adminContactName: string;
  serviceName?: string;
  nonce?: string;
}

/**
 * Unauthorized page - shown when user is not whitelisted
 */
export const UnauthorizedPage: React.FC<UnauthorizedPageProps> = ({ 
  adminContactEmail, 
  adminContactName,
  serviceName = 'AF Auth',
  nonce 
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Access Denied - {serviceName}</title>
        <style nonce={nonce}>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
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
            font-size: 64px;
            margin-bottom: 24px;
          }
          
          h1 {
            color: #1a202c;
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 16px;
          }
          
          .message {
            color: #4a5568;
            font-size: 18px;
            line-height: 1.6;
            margin-bottom: 32px;
          }
          
          .contact-box {
            background: #f7fafc;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 32px;
          }
          
          .contact-box h2 {
            color: #2d3748;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
          }
          
          .contact-box p {
            color: #718096;
            font-size: 16px;
            margin-bottom: 8px;
          }
          
          .contact-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #667eea;
            font-weight: 600;
            text-decoration: none;
            transition: color 0.2s ease;
          }
          
          .contact-link:hover {
            color: #5a67d8;
          }
          
          .email-icon {
            width: 20px;
            height: 20px;
          }
          
          .footer {
            color: #a0aec0;
            font-size: 14px;
            line-height: 1.6;
          }
          
          .back-link {
            margin-top: 24px;
            display: inline-block;
            color: #718096;
            text-decoration: none;
            transition: color 0.2s ease;
          }
          
          .back-link:hover {
            color: #4a5568;
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="icon">🚫</div>
          <h1>Access Denied</h1>
          <p className="message">
            Your GitHub account has been authenticated successfully, but you don't have access to this service yet.
          </p>
          
          <div className="contact-box">
            <h2>Need Access?</h2>
            <p>Please contact the administrator to request access:</p>
            <a href={`mailto:${adminContactEmail}?subject=Access Request for ${serviceName}`} className="contact-link">
              <svg className="email-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              {adminContactName} ({adminContactEmail})
            </a>
          </div>
          
          <p className="footer">
            Once your access has been approved, you'll be able to use this service.
          </p>
          
          <a href="/" className="back-link">← Back to home</a>
        </div>
      </body>
    </html>
  );
};
