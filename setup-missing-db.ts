import { Client } from 'pg';

async function setupMissing() {
  const connectionString = 'postgresql://postgres:jjKwz62zyDjxzvKS@db.wbhnajwiikxtnkjswtlk.supabase.co:5432/postgres';
  const client = new Client({ connectionString });

  try {
    console.log('Connecting to database...');
    await client.connect();
    
    console.log('Executing missing tables creation...');
    await client.query(`
      create table if not exists public.songs (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references auth.users(id) on delete cascade not null,
        playlist_id uuid references public.playlists(id) on delete cascade,
        title text not null,
        youtube_url text not null,
        thumbnail_url text,
        created_at timestamptz not null default timezone('utc'::text, now())
      );
      
      alter table public.songs enable row level security;
      
      create table if not exists public.api_search_results (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references auth.users(id) on delete cascade not null,
        query text not null,
        results jsonb not null,
        created_at timestamptz not null default timezone('utc'::text, now())
      );
      
      alter table public.api_search_results enable row level security;
    `);
    console.log('Tables created.');
    
    console.log('Adding missing policies...');
    try {
      await client.query(`
        create policy "Users can manage own songs"
          on public.songs for all
          using ( auth.uid() = user_id );
      `);
    } catch(e: any) { console.log('Policy songs issue:', e.message); }
    
    try {
      await client.query(`
        create policy "Users can manage own search results"
          on public.api_search_results for all
          using ( auth.uid() = user_id );
      `);
    } catch(e: any) { console.log('Policy search results issue:', e.message); }

    console.log('Database setup complete!');
  } catch (err) {
    console.error('Error setting up database:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupMissing();
