# Dependency Graph

Multi-language intra-repository dependency analysis.

Supports Python, JavaScript/TypeScript, C/C++, Rust, Go, Java, C#, Swift, HTML/CSS, and SQL.

Includes classification of external dependencies as stdlib vs third-party.

## Statistics

- **Total files**: 18
- **Intra-repo dependencies**: 33
- **External stdlib dependencies**: 4
- **External third-party dependencies**: 10

## External Dependencies

### Standard Library / Core Modules

Total: 4 unique modules

- `crypto`
- `fs`
- `http`
- `path`

### Third-Party Packages

Total: 10 unique packages

- `@prisma/client`
- `axios`
- `dotenv`
- `express`
- `jsonwebtoken`
- `pino`
- `pino-http`
- `react`
- `react-dom/server`
- `supertest`

## Most Depended Upon Files (Intra-Repo)

- `src/config/index.ts` (8 dependents)
- `src/utils/logger.ts` (7 dependents)
- `src/db/index.ts` (6 dependents)
- `src/services/jwt.ts` (4 dependents)
- `src/server.ts` (3 dependents)
- `src/services/github-oauth.ts` (3 dependents)
- `src/routes/auth.ts` (1 dependents)
- `src/routes/jwt.ts` (1 dependents)

## Files with Most Dependencies (Intra-Repo)

- `src/routes/auth.ts` (5 dependencies)
- `src/server.ts` (5 dependencies)
- `src/routes/auth.test.ts` (3 dependencies)
- `src/services/jwt.ts` (3 dependencies)
- `src/db/index.ts` (2 dependencies)
- `src/routes/jwt.test.ts` (2 dependencies)
- `src/routes/jwt.ts` (2 dependencies)
- `src/services/github-oauth.test.ts` (2 dependencies)
- `src/services/github-oauth.ts` (2 dependencies)
- `src/services/jwt.test.ts` (2 dependencies)
