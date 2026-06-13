// Replace these with your actual Supabase project credentials
const SUPABASE_URL = "https://retndnwgbglbrzfdbxyn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldG5kbndnYmdsYnJ6ZmRieHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTUwMjksImV4cCI6MjA5NjkzMTAyOX0.kLGrttUz_pKOZycTmNEDRb5TDoPKMLAnVHSFUu5A_gI";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
