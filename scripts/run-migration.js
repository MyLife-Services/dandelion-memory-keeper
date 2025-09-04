require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class Migrator {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        this.migrationsDir = path.join(__dirname, '../migrations');
    }

    async init() {
        await this.createMigrationsTable();
    }

    async createMigrationsTable() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                run_on TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
    }

    async getCompletedMigrations() {
        const result = await this.pool.query('SELECT name FROM migrations ORDER BY run_on');
        return result.rows.map(row => row.name);
    }

    async run() {
        await this.init();
        const completedMigrations = new Set(await this.getCompletedMigrations());
        
        const migrationFiles = fs.readdirSync(this.migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        console.log('Starting database migrations...');
        
        for (const file of migrationFiles) {
            if (!completedMigrations.has(file)) {
                console.log(`Running migration: ${file}`);
                const client = await this.pool.connect();
                
                try {
                    await client.query('BEGIN');
                    const sql = fs.readFileSync(path.join(this.migrationsDir, file), 'utf8');
                    await client.query(sql);
                    
                    await client.query(
                        'INSERT INTO migrations (name) VALUES ($1)',
                        [file]
                    );
                    
                    await client.query('COMMIT');
                    console.log(`✅ Successfully applied migration: ${file}`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error(`❌ Failed to apply migration ${file}:`, error.message);
                    throw error;
                } finally {
                    client.release();
                }
            }
        }
        
        console.log('All migrations completed successfully!');
        await this.pool.end();
    }
}

// Run migrations if this file is executed directly
if (require.main === module) {
    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL environment variable is not set');
        process.exit(1);
    }
    
    const migrator = new Migrator();
    migrator.run().catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}

module.exports = Migrator;
