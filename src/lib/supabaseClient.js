import { createClient } from "@supabase/supabase-js";

// These come from Vite's env handling — set VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY as environment variables in Netlify (and in a local
// .env file for `netlify dev` / `npm run dev`). Both are safe to expose in
// frontend code: the anon key only grants what your RLS policies allow.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set these as environment " +
    "variables (see README) — the app cannot connect to its database without them."
  );
}

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder");
