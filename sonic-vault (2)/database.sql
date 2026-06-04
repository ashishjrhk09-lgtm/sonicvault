=================================
DATABASE TABLE
==============

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  provider text not null default 'email',
  welcome_sent boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  last_login_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists profiles_provider_idx on public.profiles(provider);
create index if not exists profiles_created_at_idx on public.profiles(created_at);
create index if not exists profiles_last_login_at_idx on public.profiles(last_login_at);
create index if not exists profiles_welcome_sent_idx on public.profiles(welcome_sent);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  playlist_id uuid references public.playlists(id) on delete cascade,
  title text not null,
  youtube_url text not null,
  thumbnail_url text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.search_cache (
  query text primary key,
  results jsonb not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.search_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  source text not null,
  user_id text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.api_search_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  query text not null,
  results jsonb not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

=================================
AUTO PROFILE CREATION TRIGGER
=====================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, provider)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_app_meta_data->>'provider', 'email')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

=================================
RLS POLICIES
===

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.songs enable row level security;

-- Profile Policies
create policy "Users can view own profile"
  on public.profiles for select
  using ( auth.uid() = id );

create policy "Users can update own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- Playlist Policies
create policy "Users can manage own playlists"
  on public.playlists for all
  using ( auth.uid() = user_id );

-- Song Policies
create policy "Users can manage own songs"
  on public.songs for all
  using ( auth.uid() = user_id );

-- Expose search results schema if necessary (otherwise restricted)
alter table public.api_search_results enable row level security;
create policy "Users can manage own search results"
  on public.api_search_results for all
  using ( auth.uid() = user_id );
