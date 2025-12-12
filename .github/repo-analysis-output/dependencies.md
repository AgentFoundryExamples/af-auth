# Dependency Graph

Multi-language intra-repository dependency analysis.

Supports Python, JavaScript/TypeScript, C/C++, Rust, Go, Java, C#, Swift, HTML/CSS, and SQL.

Includes classification of external dependencies as stdlib vs third-party.

## Statistics

- **Total files**: 47
- **Intra-repo dependencies**: 129
- **External stdlib dependencies**: 4
- **External third-party dependencies**: 20

## External Dependencies

### Standard Library / Core Modules

Total: 4 unique modules

- `crypto`
- `http`
- `path`
- `readline`

### Third-Party Packages

Total: 20 unique packages

- `@eslint/js`
- `@prisma/client`
- `axios`
- `bcrypt`
- `dotenv`
- `express`
- `express-rate-limit`
- `globals`
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
- `zod`

## Most Depended Upon Files (Intra-Repo)

- `src/db/index.ts` (20 dependents)
- `src/utils/logger.ts` (20 dependents)
- `src/config/index.ts` (19 dependents)
- `src/services/metrics.ts` (13 dependents)
- `src/services/jwt.ts` (8 dependents)
- `src/services/redis-client.ts` (8 dependents)
- `src/services/token-revocation.ts` (6 dependents)
- `src/services/github-oauth.ts` (5 dependents)
- `src/services/service-registry.ts` (4 dependents)
- `src/utils/encryption.ts` (4 dependents)

## Files with Most Dependencies (Intra-Repo)

- `src/server.ts` (11 dependencies)
- `src/routes/auth.ts` (8 dependencies)
- `src/routes/github-token.ts` (8 dependencies)
- `src/middleware/jwt-auth.ts` (5 dependencies)
- `src/routes/jwt.ts` (5 dependencies)
- `src/services/token-revocation.ts` (5 dependencies)
- `src/middleware/jwt-auth.test.ts` (4 dependencies)
- `src/middleware/rate-limit.ts` (4 dependencies)
- `src/routes/auth.test.ts` (4 dependencies)
- `src/routes/github-token.test.ts` (4 dependencies)
