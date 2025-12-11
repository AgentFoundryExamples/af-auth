# Local Development Setup Guide

This guide will help you set up the AF Auth service for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **PostgreSQL** 14 or higher, OR **Docker** ([Download](https://www.docker.com/))
- **Git** ([Download](https://git-scm.com/))

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/AgentFoundryExamples/af-auth.git
cd af-auth
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required Node.js packages.

### 3. Set Up PostgreSQL Database

You have two options:

#### Option A: Using Docker (Recommended)

Start PostgreSQL using Docker Compose:

```bash
docker-compose up -d
```

Verify PostgreSQL is running:

```bash
docker-compose ps
```

You should see the `af-auth-postgres` container running.

To stop PostgreSQL:
```bash
docker-compose down
```

To stop and remove all data:
```bash
docker-compose down -v
```

#### Option B: Using Local PostgreSQL

If you have PostgreSQL installed locally:

1. Create a database:
   ```bash
   createdb af_auth
   ```

2. Or using psql:
   ```bash
   psql -U postgres
   CREATE DATABASE af_auth;
   \q
   ```

### 4. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and update the following:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database Configuration
# For Docker:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/af_auth

# For local PostgreSQL (adjust username/password as needed):
# DATABASE_URL=postgresql://your_username:your_password@localhost:5432/af_auth

# Logging Configuration
LOG_LEVEL=debug
LOG_PRETTY=true
```

### 5. Generate Prisma Client

```bash
npm run db:generate
```

This generates the TypeScript types for your database schema.

### 6. Run Database Migrations

Apply the initial database schema:

```bash
npm run db:migrate:dev
```

This will:
- Create the `users` table
- Set up indexes
- Add triggers for automatic timestamp updates

### 7. Verify Database Connection

Optional: Open Prisma Studio to view your database:

```bash
npm run db:studio
```

This opens a web interface at `http://localhost:5555` where you can view and edit data.

### 8. Build the Project

Compile TypeScript to JavaScript:

```bash
npm run build
```

### 9. Run Tests

Verify everything is working:

```bash
npm test
```

All tests should pass.

### 10. Start the Development Server

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### 11. Verify the Server is Running

Open another terminal and test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-12-11T10:30:00.000Z",
  "uptime": 5.2,
  "environment": "development",
  "database": {
    "connected": true,
    "healthy": true
  }
}
```

## Common Development Tasks

### Running the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

### Database Operations

Generate Prisma client after schema changes:
```bash
npm run db:generate
```

Create a new migration:
```bash
npm run db:migrate:dev --name your_migration_name
```

Apply migrations in production:
```bash
npm run db:migrate
```

View database in browser:
```bash
npm run db:studio
```

### Code Quality

Run linter:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate test coverage report:
```bash
npm run test:coverage
```

## Troubleshooting

### Database Connection Failed

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solutions**:
1. Verify PostgreSQL is running:
   ```bash
   docker-compose ps  # for Docker
   # OR
   pg_isready -h localhost -p 5432  # for local PostgreSQL
   ```

2. Check your `DATABASE_URL` in `.env`

3. Ensure PostgreSQL port 5432 is not in use by another application:
   ```bash
   lsof -i :5432  # macOS/Linux
   netstat -ano | findstr :5432  # Windows
   ```

### Port 3000 Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solutions**:
1. Change the port in `.env`:
   ```bash
   PORT=3001
   ```

2. Or stop the process using port 3000:
   ```bash
   lsof -ti:3000 | xargs kill  # macOS/Linux
   ```

### Migration Failed

**Error**: Migration errors

**Solutions**:
1. Check migration status:
   ```bash
   npx prisma migrate status
   ```

2. Reset the database (⚠️ loses all data):
   ```bash
   npx prisma migrate reset
   ```

3. Or manually fix and resolve:
   ```bash
   npx prisma migrate resolve --rolled-back MIGRATION_NAME
   ```

### npm install Failures

**Error**: Package installation errors

**Solutions**:
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Delete and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Try using exact Node.js version:
   ```bash
   node --version  # should be 18 or higher
   ```

### TypeScript Build Errors

**Error**: TypeScript compilation errors

**Solutions**:
1. Regenerate Prisma client:
   ```bash
   npm run db:generate
   ```

2. Clean and rebuild:
   ```bash
   rm -rf dist
   npm run build
   ```

## Development Workflow

1. **Make code changes** in `src/`
2. **Run tests** to verify changes: `npm test`
3. **Run linter** to check code quality: `npm run lint:fix`
4. **Test manually** using `npm run dev`
5. **Check health endpoint** to ensure service is working
6. **Commit changes** with meaningful commit messages

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | development | Environment (development/production) |
| `PORT` | No | 3000 | Server port |
| `HOST` | No | 0.0.0.0 | Server host |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `DB_POOL_MIN` | No | 2 | Minimum connection pool size |
| `DB_POOL_MAX` | No | 10 | Maximum connection pool size |
| `DB_CONNECTION_TIMEOUT_MS` | No | 5000 | Connection timeout in milliseconds |
| `DB_MAX_RETRIES` | No | 3 | Maximum connection retry attempts |
| `DB_RETRY_DELAY_MS` | No | 1000 | Base retry delay in milliseconds |
| `LOG_LEVEL` | No | info | Log level (trace/debug/info/warn/error/fatal) |
| `LOG_PRETTY` | No | true (dev) | Enable pretty printing of logs |

## Next Steps

- Review [Database Documentation](./database.md) for schema details
- Review [Logging Documentation](./logging.md) for logging practices
- Implement GitHub OAuth flow (see issue tracker)
- Add JWT token generation (see issue tracker)

## Getting Help

- Check the [main README](../README.md) for project overview
- Review the [documentation](../docs/) for detailed guides
- Open an issue on GitHub for bugs or questions
