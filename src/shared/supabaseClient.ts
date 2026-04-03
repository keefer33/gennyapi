import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseServerClients {
  supabaseServerClient: SupabaseClient;
}

const getServerClient = async (): Promise<SupabaseServerClients> => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const supabaseServerClient: SupabaseClient = createClient(supabaseUrl, supabaseKey);
  return { supabaseServerClient };
};

export { getServerClient };
