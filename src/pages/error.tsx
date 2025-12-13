import React from 'react';

export interface ErrorPageProps {
  title: string;
  message: string;
  serviceName?: string;
  nonce?: string;
}

/**
 * Generic error page for OAuth errors
 */
export const ErrorPage: React.FC<ErrorPageProps> = ({ 
  title, 
  message,
  serviceName = 'AF Auth',
  nonce 
}) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - {serviceName}</title>
        <style nonce={nonce}>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
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
          
          .button {
            display: inline-block;
            background: #667eea;
            color: white;
            font-size: 16px;
            font-weight: 600;
            padding: 14px 32px;
            border: none;
            border-radius: 8px;
            text-decoration: none;
            transition: all 0.2s ease;
            cursor: pointer;
          }
          
          .button:hover {
            background: #5a67d8;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
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
          <div className="icon">⚠️</div>
          <h1>{title}</h1>
          <p className="message">{message}</p>
          <a href="/" className="button">Try Again</a>
          <p className="footer">
            If the problem persists, please contact support.
          </p>
        </div>
      </body>
    </html>
  );
};
