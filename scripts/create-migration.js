const fs = require('fs').promises;
const path = require('path');

async function createMigration() {
    const migrationsDir = path.join(__dirname, '../migrations');
    
    // Ensure migrations directory exists
    try {
        await fs.mkdir(migrationsDir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            console.error('❌ Error creating migrations directory:', error);
            process.exit(1);
        }
    }

    // Get migration name from command line arguments
    const migrationName = process.argv[2];
    if (!migrationName) {
        console.error('❌ Please provide a migration name (e.g., add_new_table)');
        console.log('Usage: npm run db:create-migration <migration_name>');
        process.exit(1);
    }

    // Create migration filename with timestamp
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const migrationId = `${timestamp}_${migrationName}.sql`;
    const migrationPath = path.join(migrationsDir, migrationId);

    // Create migration file with template
    const template = `-- Migration: ${migrationName}
-- Description: 
-- Created: ${new Date().toISOString()}

BEGIN;

-- Your migration SQL here
-- Use IF NOT EXISTS for all CREATE statements
-- Use IF EXISTS for all DROP statements
-- Include comments explaining complex operations

-- Example:
-- CREATE TABLE IF NOT EXISTS table_name (
--     id SERIAL PRIMARY KEY,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- CREATE INDEX IF NOT EXISTS idx_name ON table_name(column_name);

-- ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE;

-- DROP TRIGGER IF EXISTS trigger_name ON table_name;
-- DROP FUNCTION IF EXISTS function_name();

COMMIT;
`;

    try {
        await fs.writeFile(migrationPath, template);
        console.log(`✅ Created migration: ${migrationPath}`);
    } catch (error) {
        console.error('❌ Error creating migration file:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    createMigration().catch(console.error);
}

module.exports = createMigration;
