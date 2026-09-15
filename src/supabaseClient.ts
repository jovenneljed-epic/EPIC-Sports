import { createClient } from '@supabase/supabase-js';

// Replace with your actual anon public key from Project Settings -> API
const supabaseUrl = 'https://ukhmrgbkrfawgszltzsr.supabase.co';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_PUBLIC_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);