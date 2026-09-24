#!/bin/bash
set -e
echo "=== FC SMS Setup ==="

# Check PostgreSQL
if ! command -v psql &>/dev/null; then
  echo ""
  echo "❌ PostgreSQL not found."
  echo "   Install it from https://postgresapp.com (easiest on Mac)"
  echo "   After installing, re-run this script."
  exit 1
fi

echo "✅ PostgreSQL found: $(psql --version)"

# Create DB & user
echo "→ Creating database..."
psql postgres -c "CREATE USER fcsms WITH PASSWORD 'fcsms123';" 2>/dev/null || echo "  (user already exists)"
psql postgres -c "CREATE DATABASE fcsms OWNER fcsms;" 2>/dev/null || echo "  (database already exists)"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE fcsms TO fcsms;"

# Apply schema
echo "→ Applying schema..."
psql -U fcsms -d fcsms -f schema.sql

# Grant permissions
psql postgres -d fcsms -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO fcsms;"
psql postgres -d fcsms -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO fcsms;"

# Seed data
echo "→ Seeding database..."
psql -U fcsms -d fcsms << 'SQL'
INSERT INTO "Store"(id, name, code, city) VALUES
  ('store-001', 'FC Franchise - Pune', 'PNQ001', 'Pune')
ON CONFLICT(code) DO NOTHING;

INSERT INTO "User"(id, phone, password, name, role, "storeId") VALUES
  ('user-super', '9999999999', '$2a$10$S6v3..7A8zxhwLMMYqVGpOESBTYf946uFlqSdirFOeKTxzrQMBksm', 'Super Admin', 'SUPER_ADMIN', 'store-001'),
  ('user-admin', '9876543210', '$2a$10$S6v3..7A8zxhwLMMYqVGpOESBTYf946uFlqSdirFOeKTxzrQMBksm', 'Store Admin', 'STORE_ADMIN', 'store-001')
ON CONFLICT(phone) DO NOTHING;
SQL

# Install dependencies
echo "→ Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Run './start.sh' to start the app."
