# UI Customization Guide

This guide explains how to customize the appearance and behavior of the SSR (Server-Side Rendered) pages in AF Auth.

## Overview

AF Auth uses React components rendered server-side to generate HTML pages for the authentication flow. These pages are fully customizable through environment variables and code modifications.

## SSR Pages

The authentication flow includes four main pages:

1. **Login Page** (`/auth/github`) - Initial OAuth entry point
2. **Token Ready Page** - Shown to whitelisted users after successful authentication
3. **Unauthorized Page** - Shown to non-whitelisted users
4. **Error Page** - Shown when authentication errors occur

## Configuration-Based Customization

### Environment Variables

Customize page content through environment variables in your `.env` file:

```bash
# Service branding
BASE_URL=https://auth.example.com

# Admin contact information (shown on unauthorized page)
ADMIN_CONTACT_EMAIL=admin@example.com
ADMIN_CONTACT_NAME=System Administrator
```

### Available Configuration

| Variable | Default | Used In | Purpose |
|----------|---------|---------|---------|
| `BASE_URL` | `http://localhost:3000` | All pages | Base URL for the service |
| `ADMIN_CONTACT_EMAIL` | `admin@example.com` | Unauthorized page | Contact email for access requests |
| `ADMIN_CONTACT_NAME` | `Administrator` | Unauthorized page | Display name for admin contact |

## Code-Based Customization

### Service Name

The service name appears on all pages. To customize it, modify the `serviceName` prop when rendering pages.

**File**: `src/routes/auth.ts`

```typescript
// Current implementation
const html = renderPage(
  React.createElement(LoginPage, {
    authUrl,
    serviceName: 'AF Auth', // Change this
  })
);

// Customized
const html = renderPage(
  React.createElement(LoginPage, {
    authUrl,
    serviceName: 'My Custom Service',
  })
);
```

**Better approach**: Add to config module:

**File**: `src/config/index.ts`

```typescript
export const config: Config = {
  // ... existing config
  ui: {
    serviceName: getOptionalEnv('SERVICE_NAME', 'AF Auth'),
    adminContactEmail: getOptionalEnv('ADMIN_CONTACT_EMAIL', 'admin@example.com'),
    adminContactName: getOptionalEnv('ADMIN_CONTACT_NAME', 'Administrator'),
  },
};
```

Then update `.env`:
```bash
SERVICE_NAME=My Custom Service
```

### Page Components

Each page is a React component in the `src/pages/` directory. You can fully customize the HTML, CSS, and content.

#### Login Page

**File**: `src/pages/login.tsx`

**Customization points**:
- Logo emoji: Change `🔐` to your preferred emoji or remove it
- Gradient colors: Modify the `background: linear-gradient(...)` in the styles
- Button style: Customize `.button` CSS class
- Footer text: Update the footer paragraph

**Example customization**:

```typescript
export const LoginPage: React.FC<LoginPageProps> = ({ 
  authUrl, 
  serviceName = 'AF Auth' 
}) => {
  return (
    <html lang="en">
      <head>
        {/* ... meta tags ... */}
        <style>{`
          /* Custom brand colors */
          body {
            background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%);
          }
          
          .button {
            background: #2C3E50;
          }
          
          .button:hover {
            background: #34495E;
          }
          
          /* Add your logo */
          .logo {
            background-image: url('/path/to/logo.png');
            background-size: contain;
            background-repeat: no-repeat;
            width: 200px;
            height: 80px;
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="logo"></div>
          <h1>Welcome to {serviceName}</h1>
          {/* Custom welcome message */}
          <p className="subtitle">
            Join our community by signing in with your GitHub account.
          </p>
          <a href={authUrl} className="button">
            <svg className="github-icon" viewBox="0 0 16 16" fill="currentColor">
              {/* GitHub icon SVG */}
            </svg>
            Sign in with GitHub
          </a>
          <p className="footer">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </body>
    </html>
  );
};
```

#### Unauthorized Page

**File**: `src/pages/unauthorized.tsx`

**Customization points**:
- Icon: Change `🚫` to a different emoji or custom icon
- Message text: Customize the access denied message
- Contact box styling: Modify `.contact-box` CSS
- Email subject line: Change the mailto subject

**Example customization**:

```typescript
<div className="contact-box">
  <h2>Request Access</h2>
  <p>To request access to this service, please:</p>
  <ol>
    <li>Send an email to <a href={`mailto:${adminContactEmail}`}>{adminContactEmail}</a></li>
    <li>Include your GitHub username: {githubLogin}</li>
    <li>Explain why you need access</li>
  </ol>
</div>
```

#### Token Ready Page

**File**: `src/pages/token-ready.tsx`

**Purpose**: Displays JWT token to whitelisted users after successful authentication

**Customization points**:
- Success icon: Change `✅` 
- Token display styling: Customize `.token-container` and `.token-value` CSS
- Copy button behavior: Modify the `copyToken` JavaScript function
- Info box content: Customize "What's next?" section
- Add additional user information fields
- Include next steps or links

**Props**:
- `userId`: User UUID
- `githubLogin`: GitHub username
- `serviceName`: Service name (default: 'AF Auth')
- `token`: JWT token to display (optional)

**Example customization**:

```typescript
<div className="info-box">
  <p>
    <strong>What's next?</strong>
  </p>
  <ul>
    <li>Copy your JWT token using the button above</li>
    <li>Store it securely: <code>echo "TOKEN" > ~/.af-auth-token</code></li>
    <li>Use it with API requests: <code>curl -H "Authorization: Bearer TOKEN"</code></li>
    <li>See <a href="/docs/jwt">JWT documentation</a> for more details</li>
  </ul>
</div>
```

**Token Display Features**:
- Displays JWT in a monospace code block
- One-click copy to clipboard functionality
- Visual feedback when token is copied
- Responsive design for mobile devices
- Automatic scrolling for long tokens

**Security Notes**:
- Tokens are only displayed once after initial authentication
- Users should copy and store tokens securely
- Refresh page won't regenerate the same token
- Each authentication generates a brand new token

#### Error Page

**File**: `src/pages/error.tsx`

**Customization points**:
- Error icon: Change `⚠️`
- Button behavior: Customize retry logic
- Support contact information

## Styling Guidelines

### Design System

All pages use a consistent design system:

```css
/* Color Palette (Customize these) */
--primary-color: #667eea;
--primary-dark: #5a67d8;
--success-color: #43e97b;
--danger-color: #f5576c;
--text-primary: #1a202c;
--text-secondary: #4a5568;
--text-muted: #718096;
--background-light: #f7fafc;
--border-color: #e2e8f0;
```

### Typography

Default font stack:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

To use a custom font:

1. Add Google Fonts or custom font in the `<head>`:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
   ```

2. Update font-family in styles:
   ```css
   body {
     font-family: 'Inter', sans-serif;
   }
   ```

### Responsive Design

All pages are mobile-responsive by default with these breakpoints:

```css
/* Mobile-first approach */
@media (min-width: 768px) {
  /* Tablet and desktop styles */
}
```

## Advanced Customization

### Adding Custom Assets

To add images, fonts, or other static assets:

1. Create a `public` directory:
   ```bash
   mkdir -p public/images
   ```

2. Serve static files in `src/server.ts`:
   ```typescript
   import path from 'path';
   
   app.use('/static', express.static(path.join(__dirname, '../public')));
   ```

3. Reference in page components:
   ```html
   <img src="/static/images/logo.png" alt="Logo" />
   ```

### Using External CSS

Instead of inline styles, you can use external CSS files:

1. Create CSS file:
   ```bash
   mkdir -p public/css
   touch public/css/auth.css
   ```

2. Add link in page component:
   ```html
   <head>
     <link rel="stylesheet" href="/static/css/auth.css" />
   </head>
   ```

3. Serve static files (see above)

### Adding Analytics

To add analytics tracking:

```typescript
export const LoginPage: React.FC<LoginPageProps> = ({ authUrl, serviceName }) => {
  return (
    <html lang="en">
      <head>
        {/* ... other head content ... */}
        
        {/* Google Analytics */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
        <script dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'GA_MEASUREMENT_ID');
          `
        }}></script>
      </head>
      {/* ... body ... */}
    </html>
  );
};
```

### Custom Redirects

After successful authentication, you might want to redirect to a different URL:

**File**: `src/routes/auth.ts`

```typescript
if (user.isWhitelisted) {
  // Option 1: Redirect to external URL
  return res.redirect('https://dashboard.example.com?token=...&userId=' + user.id);
  
  // Option 2: Render page with auto-redirect
  const html = renderPage(
    React.createElement(TokenReadyPage, {
      userId: user.id,
      githubLogin: githubUser.login,
      redirectUrl: 'https://dashboard.example.com',
      redirectDelay: 3000, // 3 seconds
    })
  );
  return res.setHeader('Content-Type', 'text/html').send(html);
}
```

Then update the TokenReadyPage component to include auto-redirect:

```typescript
export const TokenReadyPage: React.FC<TokenReadyPageProps> = ({ 
  userId, 
  githubLogin,
  redirectUrl,
  redirectDelay = 0,
}) => {
  return (
    <html lang="en">
      <head>
        {redirectUrl && redirectDelay > 0 && (
          <meta httpEquiv="refresh" content={`${redirectDelay / 1000};url=${redirectUrl}`} />
        )}
        {/* ... */}
      </head>
      {/* ... */}
    </html>
  );
};
```

## Dark Mode Support

Add dark mode support with CSS media queries:

```css
/* Light mode (default) */
body {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #1a202c;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  body {
    background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
    color: #f7fafc;
  }
  
  .container {
    background: #2d3748;
    color: #f7fafc;
  }
}
```

## Internationalization (i18n)

For multi-language support:

1. Add language to config:
   ```typescript
   ui: {
     language: getOptionalEnv('UI_LANGUAGE', 'en'),
   }
   ```

2. Create language files:
   ```typescript
   // src/i18n/en.ts
   export const messages = {
     login: {
       title: 'Welcome',
       button: 'Sign in with GitHub',
     },
     unauthorized: {
       title: 'Access Denied',
       message: 'You do not have access...',
     },
   };
   ```

3. Use in components:
   ```typescript
   import { messages } from '../i18n/en';
   
   <h1>{messages.login.title}</h1>
   ```

## Testing Custom Pages

### Visual Testing

Start the dev server and test pages:

```bash
npm run dev

# Test login page
open http://localhost:3000/auth/github

# Test unauthorized page (requires DB setup with non-whitelisted user)
# Test token-ready page (requires DB setup with whitelisted user)
```

### Automated Testing

Add visual regression tests using a tool like Playwright:

```typescript
import { test, expect } from '@playwright/test';

test('login page renders correctly', async ({ page }) => {
  await page.goto('http://localhost:3000/auth/github');
  
  await expect(page.locator('h1')).toContainText('Welcome');
  await expect(page.locator('.button')).toContainText('Sign in with GitHub');
  
  // Take screenshot for visual comparison
  await page.screenshot({ path: 'screenshots/login-page.png' });
});
```

## Best Practices

1. **Keep styles inline for SSR**: Inline styles ensure the page looks correct before external CSS loads
2. **Mobile-first design**: Design for mobile, then enhance for desktop
3. **Minimal dependencies**: Avoid heavy JavaScript frameworks for better performance
4. **Accessibility**: Use semantic HTML and ARIA labels
5. **Performance**: Optimize images, minimize CSS, avoid render-blocking resources
6. **Security**: Never expose secrets or sensitive data in client-side code
7. **Consistency**: Maintain consistent design across all pages

## Common Customizations

### Add Company Logo

```typescript
<div className="logo">
  <img src="/static/images/company-logo.png" alt="Company Name" style={{ maxWidth: '200px' }} />
</div>
```

### Custom Color Scheme

Update gradients and button colors to match your brand:

```css
body {
  background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
}

.button {
  background: #YOUR_BRAND_COLOR;
}
```

### Additional User Information

Show more user details on the token-ready page:

```typescript
<div className="user-info-row">
  <span className="user-info-label">Email</span>
  <span className="user-info-value">{githubUser.email}</span>
</div>
<div className="user-info-row">
  <span className="user-info-label">Name</span>
  <span className="user-info-value">{githubUser.name}</span>
</div>
```

## Troubleshooting

### Styles Not Applying

- Ensure styles are in the `<style>` tag within `<head>`
- Check for CSS specificity conflicts
- Verify inline styles are properly formatted

### Images Not Loading

- Confirm static file serving is configured
- Check image paths are correct
- Verify files exist in the `public` directory

### Content Not Updating

- Restart the dev server after changing page components
- Clear browser cache
- Check that changes are saved

## Resources

- [React Documentation](https://react.dev/)
- [CSS-Tricks](https://css-tricks.com/)
- [MDN Web Docs](https://developer.mozilla.org/)
- [Server-Side Rendering Best Practices](https://web.dev/rendering-on-the-web/)
