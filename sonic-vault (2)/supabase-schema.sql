-- Supabase Schema for Sonic Vault

-- 1. search_cache
DROP TABLE IF EXISTS public.search_cache;
CREATE TABLE public.search_cache (
    query text PRIMARY KEY,
    results jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access on search_cache" ON public.search_cache FOR SELECT USING (true);
CREATE POLICY "Allow public insert on search_cache" ON public.search_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on search_cache" ON public.search_cache FOR UPDATE USING (true);

-- 2. search_logs
DROP TABLE IF EXISTS public.search_logs;
CREATE TABLE public.search_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    query text,
    user_id text,
    source text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert on search_logs" ON public.search_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on search_logs" ON public.search_logs FOR SELECT USING (true);

-- 3. profiles
DROP TABLE IF EXISTS public.profiles;
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    updated_at timestamp with time zone,
    PRIMARY KEY (id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone." on profiles for select using (true);
CREATE POLICY "Users can insert their own profile." on profiles for insert with check (true);
CREATE POLICY "Users can update own profile." on profiles for update using (true);

-- 4. playlists
CREATE TABLE IF NOT EXISTS public.playlists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own playlists." ON public.playlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own playlists." ON public.playlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own playlists." ON public.playlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own playlists." ON public.playlists FOR DELETE USING (auth.uid() = user_id);

-- 5. songs (tied to playlist or general)
CREATE TABLE IF NOT EXISTS public.songs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users NOT NULL,
    playlist_id uuid REFERENCES public.playlists ON DELETE CASCADE,
    youtube_url text NOT NULL,
    title text NOT NULL,
    thumbnail_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own songs." ON public.songs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own songs." ON public.songs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own songs." ON public.songs FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own songs." ON public.songs FOR UPDATE USING (auth.uid() = user_id);

-- 6. recently_played (if they still want it in backend, but user requested local storage for history, so we might not need it, but we can keep it as is or drop it)
-- Actually, the user asked for local device storage for history. We can drop this table.
DROP TABLE IF EXISTS public.recently_played;

-- 7. api_search_results
CREATE TABLE IF NOT EXISTS public.api_search_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users NOT NULL,
    query text NOT NULL,
    results jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.api_search_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own search results." ON public.api_search_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own search results." ON public.api_search_results FOR INSERT WITH CHECK (auth.uid() = user_id);

