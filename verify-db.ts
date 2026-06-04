import { Client } from 'pg';

async function verifyDb() {
  const connectionString = 'postgresql://postgres:jjKwz62zyDjxzvKS@db.wbhnajwiikxtnkjswtlk.supabase.co:5432/postgres';
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Check tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    
    console.log('Tables in public schema:');
    res.rows.forEach(row => console.log('- ' + row.table_name));
    
    // Check policies
    const resPolicies = await client.query(`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public';
    `);
    console.log('\nPolicies:');
    resPolicies.rows.forEach(row => console.log('- ' + row.tablename + ' : ' + row.policyname));
    
  } catch (e) {
    console.error('Error connecting to DB:', e);
  } finally {
    await client.end();
  }
}

verifyDb();
