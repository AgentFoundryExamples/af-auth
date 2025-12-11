#!/bin/bash

# Script to create and test database migrations
# Usage: ./scripts/create-migration.sh "migration_name"

set -e

MIGRATION_NAME="${1:-initial_setup}"

echo "Creating migration: $MIGRATION_NAME"

# Generate the migration
npx prisma migrate dev --name "$MIGRATION_NAME" --create-only

echo ""
echo "Migration files created!"
echo "Review the migration SQL in prisma/migrations/"
echo ""
echo "To apply the migration, run:"
echo "  npm run db:migrate:dev"
echo ""
echo "Or to apply in production:"
echo "  npm run db:migrate"
