#!/bin/bash

# Script to validate database connection and migrations
# Usage: ./scripts/validate-db.sh

set -e

echo "Validating database connection..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  echo "Please set it in your .env file or environment"
  exit 1
fi

echo "✓ DATABASE_URL is set"

# Try to connect to the database
echo "Testing database connection..."
npx prisma db execute --stdin <<EOF || {
  echo "ERROR: Could not connect to database"
  echo "Please check your DATABASE_URL and ensure the database is running"
  exit 1
}
SELECT 1;
EOF

echo "✓ Database connection successful"

# Check migration status
echo "Checking migration status..."
npx prisma migrate status

echo ""
echo "✓ Database validation complete"
