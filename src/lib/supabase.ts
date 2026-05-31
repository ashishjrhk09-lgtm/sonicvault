import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wbhnajwiikxtnkjswtlk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gk9Lh2wCncUlw0agdsgwrg_YmCFe1MB";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
