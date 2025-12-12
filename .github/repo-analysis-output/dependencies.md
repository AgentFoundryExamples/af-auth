# Dependency Graph

Multi-language intra-repository dependency analysis.

Supports Python, JavaScript/TypeScript, C/C++, Rust, Go, Java, C#, Swift, HTML/CSS, and SQL.

Includes classification of external dependencies as stdlib vs third-party.

## Statistics

- **Total files**: 34
- **Intra-repo dependencies**: 75
- **External stdlib dependencies**: 4
- **External third-party dependencies**: 19

## External Dependencies

### Standard Library / Core Modules

Total: 4 unique modules

- `crypto`
- `http`
- `path`
- `readline`

### Third-Party Packages

Total: 19 unique packages

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
- `rate-limit-redis`
- `react`
- `react-dom/server`
- `supertest`
- `typescript-eslint`
- `zod`

## Most Depended Upon Files (Intra-Repo)

- `src/utils/logger.ts` (14 dependents)
- `src/db/index.ts` (12 dependents)
- `src/config/index.ts` (12 dependents)
- `src/services/redis-client.ts` (5 dependents)
- `src/services/github-oauth.ts` (5 dependents)
- `src/services/service-registry.ts` (4 dependents)
- `src/utils/encryption.ts` (4 dependents)
- `src/middleware/rate-limit.ts` (4 dependents)
- `src/middleware/validation.ts` (4 dependents)
- `src/server.ts` (4 dependents)

## Files with Most Dependencies (Intra-Repo)

- `src/routes/github-token.ts` (8 dependencies)
- `src/routes/auth.ts` (7 dependencies)
- `src/server.ts` (7 dependencies)
- `src/routes/auth.test.ts` (4 dependencies)
- `src/routes/github-token.test.ts` (4 dependencies)
- `src/routes/jwt.ts` (4 dependencies)
- `scripts/migrate-encrypt-tokens.ts` (3 dependencies)
- `src/middleware/rate-limit.ts` (3 dependencies)
- `src/services/github-oauth.test.ts` (3 dependencies)
- `src/services/github-oauth.ts` (3 dependencies)
