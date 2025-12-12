# Dependency Graph

Multi-language intra-repository dependency analysis.

Supports Python, JavaScript/TypeScript, C/C++, Rust, Go, Java, C#, Swift, HTML/CSS, and SQL.

Includes classification of external dependencies as stdlib vs third-party.

## Statistics

- **Total files**: 53
- **Intra-repo dependencies**: 150
- **External stdlib dependencies**: 4
- **External third-party dependencies**: 21

## External Dependencies

### Standard Library / Core Modules

Total: 4 unique modules

- `crypto`
- `http`
- `path`
- `readline`

### Third-Party Packages

Total: 21 unique packages

- `@eslint/js`
- `@prisma/client`
- `axios`
- `bcrypt`
- `dotenv`
- `express`
- `express-rate-limit`
- `globals`
- `helmet`
- `ioredis`
- `jsonwebtoken`
- `ms`
- `pino`
- `pino-http`
- `prom-client`
- `rate-limit-redis`
- `react`
- `react-dom/server`
- `supertest`
- `typescript-eslint`
- ... and 1 more (see JSON for full list)

## Most Depended Upon Files (Intra-Repo)

- `src/config/index.ts` (24 dependents)
- `src/db/index.ts` (23 dependents)
- `src/utils/logger.ts` (23 dependents)
- `src/services/metrics.ts` (16 dependents)
- `src/services/jwt.ts` (8 dependents)
- `src/services/redis-client.ts` (8 dependents)
- `src/services/token-revocation.ts` (6 dependents)
- `src/services/service-registry.ts` (5 dependents)
- `src/server.ts` (5 dependents)
- `src/services/github-oauth.ts` (5 dependents)

## Files with Most Dependencies (Intra-Repo)

- `src/server.ts` (12 dependencies)
- `src/routes/auth.ts` (8 dependencies)
- `src/routes/github-token.ts` (8 dependencies)
- `src/routes/jwt.ts` (6 dependencies)
- `src/services/health-check.test.ts` (6 dependencies)
- `src/middleware/jwt-auth.ts` (5 dependencies)
- `src/services/health-check.ts` (5 dependencies)
- `src/services/jwt.ts` (5 dependencies)
- `src/services/token-revocation.ts` (5 dependencies)
- `scripts/check-key-rotation.ts` (4 dependencies)
