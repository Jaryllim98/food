import { createClient } from '@supabase/supabase-js';


console.log("Attempting to connect to Supabase URL:", process.env.REACT_APP_SUPABASE_URL);
console.log("Is Supabase Anon Key loaded:", process.env.REACT_APP_SUPABASE_ANON_KEY? "Yes" : "No, it is NOT LOADED");
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);