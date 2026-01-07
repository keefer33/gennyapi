import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseServerClients {
  supabaseServerClient: SupabaseClient;
}

export interface SupabaseUserClients {
  supabaseUserClient: SupabaseClient;
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

const getUserClient = async (): Promise<SupabaseUserClients> => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  const supabaseUserClient: SupabaseClient = createClient(supabaseUrl, supabaseKey);

  return { supabaseUserClient };
};

export { getServerClient, getUserClient };
