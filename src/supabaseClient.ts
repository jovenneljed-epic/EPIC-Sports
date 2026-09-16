import { createClient } from '@supabase/supabase-js';

// Replace with your actual anon public key from Project Settings -> API
const supabaseUrl = 'https://ukhmrgbkrfawgszltzsr.supabase.co';
const supabaseAnonKey = 'sb_publishable_uB7grQdiSm_z6PzMvXITdA_Kdih_GuP';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);