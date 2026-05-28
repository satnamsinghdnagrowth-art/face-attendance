import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const DATABASE_URL = process.env['DATABASE_URL'] || 'postgresql://postgres:password@localhost:5432/attendance_db';

// Parse the URL into individual components so pg never sees unsupported
// libpq parameters (channel_binding, sslmode) that cause silent ETIMEDOUT
// failures during the TLS handshake with Neon / other cloud providers.
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
  } catch {
    // Fallback: use the connection string directly (local postgres)
    return {
      connectionString: DATABASE_URL,
      ssl: false,
      connectionTimeoutMillis: 15000,
    };
  }
}

const pool = new Pool(buildPoolConfig());

const MIGRATIONS_DIR = path.join(__dirname);
const MIGRATION_TABLE = 'schema_migrations';

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id          SERIAL      PRIMARY KEY,
      filename    VARCHAR(255) UNIQUE NOT NULL,
      applied_at  TIMESTAMP   DEFAULT NOW()
    )
  `);
  console.log('Migration table ensured.');
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    `SELECT filename FROM ${MIGRATION_TABLE} ORDER BY id`
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function recordMigration(filename: string): Promise<void> {
  await pool.query(
    `INSERT INTO ${MIGRATION_TABLE} (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
    [filename]
  );
}

async function runMigrations(): Promise<void> {
  console.log('Starting database migration...');
  console.log(`Database: ${DATABASE_URL.replace(/:\/\/[^@]+@/, '://***@')}`);

  const client = await pool.connect();

  try {
    await ensureMigrationTable();
    const applied = await getAppliedMigrations();

    // Get all SQL migration files sorted by name
    const migrationFiles = fs
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

      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`  [APPLY] ${filename}...`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO ${MIGRATION_TABLE} (filename) VALUES ($1)`,
          [filename]
        );
        await client.query('COMMIT');

        console.log(`  [OK] ${filename} applied successfully.`);
        migrationsRun++;
      } catch (error) {
        await client.query('ROLLBACK');
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`  [FAIL] ${filename}: ${errMsg}`);
        throw error;
      }
    }

    if (migrationsRun === 0) {
      console.log('All migrations are up to date. Nothing to apply.');
    } else {
      console.log(`\nMigration complete. Applied ${migrationsRun} migration(s).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migrations
runMigrations()
  .then(() => {
    console.log('Migration process finished successfully.');
    process.exit(0);
  })
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error('Migration process failed:', error.message);
      if ((error as NodeJS.ErrnoException).code) {
        console.error('Error code:', (error as NodeJS.ErrnoException).code);
      }
    } else {
      console.error('Migration process failed with unknown error:', error);
    }
    process.exit(1);
  });
