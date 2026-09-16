import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://seewoxandfnyepqhhqdj.supabase.co';
const supabasePublishableKey = 'sb_publishable_t7DIydfRwFjpGV_e10H_UA_HMvZwTuQ';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
