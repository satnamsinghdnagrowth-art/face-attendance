"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
const DATABASE_URL = process.env['DATABASE_URL'] || 'postgresql://postgres:password@localhost:5432/attendance_db';
function buildPoolConfig() {
    try {
        const url = new URL(DATABASE_URL);
        const requiresSsl = url.searchParams.get('sslmode') === 'require' ||
            url.searchParams.get('sslmode') === 'verify-full' ||
            DATABASE_URL.includes('neon.tech');
        return {
            host: url.hostname,
            port: parseInt(url.port, 10) || 5432,
            database: url.pathname.replace(/^\//, ''),
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            ssl: requiresSsl ? { rejectUnauthorized: false } : false,
            connectionTimeoutMillis: 15000,
        };
    }
    catch {
        return {
            connectionString: DATABASE_URL,
            ssl: false,
            connectionTimeoutMillis: 15000,
        };
    }
}
const pool = new pg_1.Pool(buildPoolConfig());
const MIGRATIONS_DIR = path_1.default.join(__dirname);
const MIGRATION_TABLE = 'schema_migrations';
async function ensureMigrationTable() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id          SERIAL      PRIMARY KEY,
      filename    VARCHAR(255) UNIQUE NOT NULL,
      applied_at  TIMESTAMP   DEFAULT NOW()
    )
  `);
    console.log('Migration table ensured.');
}
async function getAppliedMigrations() {
    const result = await pool.query(`SELECT filename FROM ${MIGRATION_TABLE} ORDER BY id`);
    return new Set(result.rows.map((r) => r.filename));
}
async function recordMigration(filename) {
    await pool.query(`INSERT INTO ${MIGRATION_TABLE} (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`, [filename]);
}
async function runMigrations() {
    console.log('Starting database migration...');
    console.log(`Database: ${DATABASE_URL.replace(/:\/\/[^@]+@/, '://***@')}`);
    const client = await pool.connect();
    try {
        await ensureMigrationTable();
        const applied = await getAppliedMigrations();
        const migrationFiles = fs_1.default
            .readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        if (migrationFiles.length === 0) {
            console.log('No migration files found.');
            return;
        }
        let migrationsRun = 0;
        for (const filename of migrationFiles) {
            if (applied.has(filename)) {
                console.log(`  [SKIP] ${filename} (already applied)`);
                continue;
            }
            const filePath = path_1.default.join(MIGRATIONS_DIR, filename);
            const sql = fs_1.default.readFileSync(filePath, 'utf8');
            console.log(`  [APPLY] ${filename}...`);
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(`INSERT INTO ${MIGRATION_TABLE} (filename) VALUES ($1)`, [filename]);
                await client.query('COMMIT');
                console.log(`  [OK] ${filename} applied successfully.`);
                migrationsRun++;
            }
            catch (error) {
                await client.query('ROLLBACK');
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error(`  [FAIL] ${filename}: ${errMsg}`);
                throw error;
            }
        }
        if (migrationsRun === 0) {
            console.log('All migrations are up to date. Nothing to apply.');
        }
        else {
            console.log(`\nMigration complete. Applied ${migrationsRun} migration(s).`);
        }
    }
    finally {
        client.release();
        await pool.end();
    }
}
runMigrations()
    .then(() => {
    console.log('Migration process finished successfully.');
    process.exit(0);
})
    .catch((error) => {
    if (error instanceof Error) {
        console.error('Migration process failed:', error.message);
        if (error.code) {
            console.error('Error code:', error.code);
        }
    }
    else {
        console.error('Migration process failed with unknown error:', error);
    }
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map