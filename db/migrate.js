const fs = require('fs');
const path = require('path');

/**
 * Run pending database migrations
 * @param {object} db - sql.js Database instance
 */
function runMigrations(db) {
    console.log('🔄 Checking migrations...');

    // 1. Ensure migrations table exists
    db.run(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Get applied list
    let applied = [];
    try {
        const res = db.exec("SELECT filename FROM _migrations");
        if (res.length > 0) {
            applied = res[0].values.map(r => r[0]);
        }
    } catch (e) {
        console.error('Failed to query migrations table', e);
    }

    // 3. Scan directory
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.log('   No migrations directory found');
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    let count = 0;
    for (const file of files) {
        if (applied.includes(file)) continue;

        console.log(`   Running migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        try {
            // Use exec for potentially multiple statements
            db.exec(sql);
            db.run("INSERT INTO _migrations (filename) VALUES (?)", [file]);
            count++;
        } catch (e) {
            console.error(`❌ Migration ${file} failed:`, e.message);
            throw e;
        }
    }

    if (count > 0) {
        console.log(`✅ Applied ${count} migrations`);
    } else {
        console.log('   All migrations up to date');
    }
}

module.exports = { runMigrations };
