import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function setup() {
  const connectionString = 'postgresql://postgres:jjKwz62zyDjxzvKS@db.wbhnajwiikxtnkjswtlk.supabase.co:5432/postgres';
  const client = new Client({ connectionString });

  try {
    console.log('Connecting to database...');
    await client.connect();
    
    console.log('Reading database.sql...');
    let sql = fs.readFileSync(path.join(process.cwd(), 'database.sql'), 'utf8');
    
    // Remote those lines with '============' or 'DATABASE' or 'RLS' etc.
    sql = sql.replace(/^=+$/gm, '-- ====')
             .replace(/^DATABASE TABLE$/gm, '-- DATABASE TABLE')
             .replace(/^AUTO PROFILE CREATION TRIGGER$/gm, '-- AUTO PROFILE CREATION TRIGGER')
             .replace(/^RLS POLICIES$/gm, '-- RLS POLICIES');
    
    // Split into statements
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    
    console.log('Executing statements...');
    for (const stmt of statements) {
      try {
        await client.query(stmt + ';');
      } catch (err: any) {
        // Ignore "policy already exists"
        if (err.code !== '42710' && err.code !== '42P07') {
          console.error('Error executing query:', stmt.substring(0, 50), '... ERROR:', err.message);
        }
      }
    }
    
    console.log('Database setup complete!');
  } catch (err) {
    console.error('Error setting up database:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setup();
