# AF Auth - Authentication Service

A TypeScript Node.js authentication service with GitHub OAuth support, whitelist-based access control, and PostgreSQL persistence.

## Features

- 🔐 **GitHub OAuth Integration** - Ready for OAuth 2.0 flow implementation
- 🗄️ **PostgreSQL Database** - Prisma ORM with type-safe queries
- 📝 **Structured Logging** - Pino logger with automatic sensitive data redaction
- 🔒 **Security-First Design** - Token redaction, whitelist-based access
- 🚀 **Cloud Run Ready** - Optimized for Google Cloud Platform deployment
- ✅ **Health Checks** - Kubernetes/Cloud Run compatible health endpoints
- 🔄 **Database Retry Logic** - Exponential backoff for connection resilience
- 📊 **Migration Support** - Prisma migrations for schema evolution

## Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/AgentFoundryExamples/af-auth.git
   cd af-auth
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. Start PostgreSQL (using Docker):
   ```bash
   docker run --name af-auth-postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_DB=af_auth \
     -p 5432:5432 \
     -d postgres:16-alpine
   ```

5. Run database migrations:
   ```bash
   npm run db:generate
   npm run db:migrate:dev
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`

### Health Check

Test the service is running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 42.5,
  "environment": "development",
  "database": {
    "connected": true,
    "healthy": true
  }
}
```

## Development

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run db:migrate:dev` - Create and apply migrations (development)
- `npm run db:migrate` - Apply migrations (production)
- `npm run db:generate` - Generate Prisma client
- `npm run db:studio` - Open Prisma Studio

### Project Structure

```
af-auth/
├── src/
│   ├── config/          # Configuration management
│   ├── db/              # Database client and utilities
│   ├── utils/           # Utilities (logger, etc.)
│   └── server.ts        # Express server setup
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Database migrations
├── docs/
│   ├── database.md      # Database documentation
│   └── logging.md       # Logging documentation
├── .env.example         # Environment variables template
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Documentation

- [Database Schema & Setup](./docs/database.md)
- [Logging Practices](./docs/logging.md)

## Environment Variables

See [.env.example](./.env.example) for all available configuration options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3000)
- `LOG_LEVEL` - Logging level (default: info)
- `LOG_PRETTY` - Pretty print logs (default: true in dev)

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## Deployment

### Cloud Run

The service is optimized for Google Cloud Run deployment:

1. Build and push container:
   ```bash
   gcloud builds submit --tag gcr.io/PROJECT_ID/af-auth
   ```

2. Deploy to Cloud Run:
   ```bash
   gcloud run deploy af-auth \
     --image gcr.io/PROJECT_ID/af-auth \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

3. Set environment variables via Secret Manager:
   ```bash
   gcloud run services update af-auth \
     --update-secrets DATABASE_URL=database-url:latest
   ```

## Security

- Sensitive data is automatically redacted from logs
- Database tokens should be encrypted at rest (future enhancement)
- Whitelist-based access control
- Connection retry with exponential backoff
- Health checks for monitoring

## Roadmap

- [ ] GitHub OAuth 2.0 flow implementation
- [ ] JWT token generation and validation
- [ ] Session management
- [ ] Rate limiting
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Docker compose for local development
- [ ] CI/CD pipeline
- [ ] Token encryption at rest



# Permanents (License, Contributing, Author)

Do not change any of the below sections

## License

This Agent Foundry Project is licensed under the Apache 2.0 License - see the LICENSE file for details.

## Contributing

Feel free to submit issues and enhancement requests!

## Author

Created by Agent Foundry and John Brosnihan
