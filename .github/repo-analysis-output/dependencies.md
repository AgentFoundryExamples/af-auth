# Dependency Graph

Multi-language intra-repository dependency analysis.

Supports Python, JavaScript/TypeScript, C/C++, Rust, Go, Java, C#, Swift, HTML/CSS, and SQL.

Includes classification of external dependencies as stdlib vs third-party.

## Statistics

- **Total files**: 14
- **Intra-repo dependencies**: 22
- **External stdlib dependencies**: 3
- **External third-party dependencies**: 9

## External Dependencies

### Standard Library / Core Modules

Total: 3 unique modules

- `crypto`
- `http`
- `path`

### Third-Party Packages

Total: 9 unique packages

- `@prisma/client`
- `axios`
- `dotenv`
- `express`
- `pino`
- `pino-http`
- `react`
- `react-dom/server`
- `supertest`

## Most Depended Upon Files (Intra-Repo)

- `src/config/index.ts` (7 dependents)
- `src/utils/logger.ts` (5 dependents)
- `src/db/index.ts` (4 dependents)
- `src/services/github-oauth.ts` (3 dependents)
- `src/server.ts` (2 dependents)
- `src/routes/auth.ts` (1 dependents)

## Files with Most Dependencies (Intra-Repo)

- `src/routes/auth.ts` (4 dependencies)
- `src/server.ts` (4 dependencies)
- `src/routes/auth.test.ts` (3 dependencies)
- `src/db/index.ts` (2 dependencies)
- `src/services/github-oauth.test.ts` (2 dependencies)
- `src/services/github-oauth.ts` (2 dependencies)
- `src/config/index.test.ts` (1 dependencies)
- `src/db/index.test.ts` (1 dependencies)
- `src/server.test.ts` (1 dependencies)
- `src/utils/logger.test.ts` (1 dependencies)
