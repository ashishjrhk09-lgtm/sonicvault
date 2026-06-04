-- =====================================
-- PLAYLISTS TABLE
-- =====================================

create table if not exists public.playlists (
id uuid primary key default gen_random_uuid(),

user_id uuid not null
references auth.users(id)
on delete cascade,

name text not null,

created_at timestamptz
default timezone('utc'::text, now())
);

-- =====================================
-- PLAYLIST SONGS TABLE
-- =====================================

create table if not exists public.playlist_songs (
id uuid primary key default gen_random_uuid(),

playlist_id uuid not null
references public.playlists(id)
on delete cascade,

video_id text not null,

title text not null,

artist text,

thumbnail_url text,

duration_seconds integer,

added_at timestamptz
default timezone('utc'::text, now())
);

-- =====================================
-- INDEXES
-- =====================================

create index if not exists playlist_user_idx
on public.playlists(user_id);

create index if not exists playlist_song_idx
on public.playlist_songs(playlist_id);

-- =====================================
-- RLS
-- =====================================

alter table public.playlists enable row level security;

alter table public.playlist_songs enable row level security;

create policy "Users manage own playlists"
on public.playlists
for all
using (auth.uid() = user_id);

create policy "Users manage own playlist songs"
on public.playlist_songs
for all
using (
exists (
select 1
from public.playlists p
where p.id = playlist_id
and p.user_id = auth.uid()
)
);
