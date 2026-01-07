import { getServerClient, SupabaseServerClients } from './supabaseClient';

export const getUserGeneration = async (dataId: string) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_generations')
    .select('*,models(*),api_id(*,key(*))')
    .eq('id', dataId)
    .single();

  if (error) {
    console.error('Error fetching polling file:', error);
    throw new Error(error.message || 'Failed to fetch polling file');
  }
  return data;
};

export const getModel = async (modelId: string) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('models')
    .select('*,api(*,key(*))')
    .eq('id', modelId)
    .single();

  if (error) {
    console.error('Error fetching model:', error);
    throw new Error(error.message || 'Failed to fetch model: ' + modelId);
  }
  return data;
};

export const createUserGeneration = async (userGeneration: any) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  //check if user has enough balance
  const userBalance = await getUserTokens(userGeneration.user_id);
  if (userBalance < userGeneration.cost) {
    throw new Error('Insufficient balance');
  }
  //create user generation
  const { data, error } = await supabaseServerClient.from('user_generations').insert(userGeneration).select().single();
  if (error) {
    console.error('Error creating user generation:', error);
    throw new Error(error.message || 'Failed to create user generation');
  }

  return data;
};

export const updateUserGeneration = async (userGeneration: any) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_generations')
    .update(userGeneration)
    .eq('id', userGeneration.id)
    .select()
    .single();
  if (error) {
    console.error('Error updating user generation:', error);
    throw new Error(error.message || 'Failed to update user generation');
  }

  return data;
};

export const createUserGenerationFile = async (userGenerationFile: any) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_generation_files')
    .insert(userGenerationFile)
    .select()
    .single();
  if (error) {
    console.error('Error creating user generation file:', error);
    throw new Error(error.message || 'Failed to create user generation file');
  }
  return data;
};

export const getUserTokens = async (userId: string): Promise<number> => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
  .from("user_profiles")
  .select("token_balance")
  .eq("user_id", userId)
  .limit(1)
  .single();

  if (error) {
    console.error('Error getting user tokens:', error);
    throw new Error(error.message || 'Failed to get user tokens');
  }

  return data?.token_balance ?? 0;
};
