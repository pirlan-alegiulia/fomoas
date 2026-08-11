import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Variabili VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mancanti. Copia .env.example in .env e inseriscile."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
