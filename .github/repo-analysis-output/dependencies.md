# Dependency Graph

Multi-language intra-repository dependency analysis.

Supports Python, JavaScript/TypeScript, C/C++, Rust, Go, Java, C#, Swift, HTML/CSS, and SQL.

Includes classification of external dependencies as stdlib vs third-party.

## Statistics

- **Total files**: 30
- **Intra-repo dependencies**: 62
- **External stdlib dependencies**: 4
- **External third-party dependencies**: 16

## External Dependencies

### Standard Library / Core Modules

Total: 4 unique modules

- `crypto`
- `http`
- `path`
- `readline`

### Third-Party Packages

Total: 16 unique packages

- `@eslint/js`
- `@prisma/client`
- `axios`
- `bcrypt`
- `dotenv`
- `express`
- `globals`
- `ioredis`
- `jsonwebtoken`
- `ms`
- `pino`
- `pino-http`
- `react`
- `react-dom/server`
- `supertest`
- `typescript-eslint`

## Most Depended Upon Files (Intra-Repo)

- `src/db/index.ts` (12 dependents)
- `src/utils/logger.ts` (12 dependents)
- `src/config/index.ts` (11 dependents)
- `src/services/github-oauth.ts` (5 dependents)
- `src/services/service-registry.ts` (4 dependents)
- `src/utils/encryption.ts` (4 dependents)
- `src/server.ts` (4 dependents)
- `src/services/jwt.ts` (4 dependents)
- `src/services/redis-client.ts` (3 dependents)
- `src/routes/auth.ts` (1 dependents)

## Files with Most Dependencies (Intra-Repo)

- `src/routes/auth.ts` (6 dependencies)
- `src/routes/github-token.ts` (6 dependencies)
- `src/server.ts` (6 dependencies)
- `src/routes/auth.test.ts` (4 dependencies)
- `src/routes/github-token.test.ts` (4 dependencies)
- `scripts/migrate-encrypt-tokens.ts` (3 dependencies)
- `src/services/github-oauth.test.ts` (3 dependencies)
- `src/services/github-oauth.ts` (3 dependencies)
- `src/services/jwt.ts` (3 dependencies)
- `scripts/manage-services.ts` (2 dependencies)
