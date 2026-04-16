import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { VendorApisRow } from './types';

export async function getVendorApiKeyByVendorName(vendor_name: string): Promise<VendorApisRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data: matchedKeyRow, error: vendorError } = await supabaseServerClient
    .from('vendor_apis')
    .select('api_key, vendor_name, config')
    .eq('vendor_name', vendor_name)
    .maybeSingle();

  if (vendorError) {
    throw new AppError(vendorError.message, {
      statusCode: 500,
      code: 'vendor_apis_fetch_failed',
      expose: false,
    });
  }

  return matchedKeyRow;
}
