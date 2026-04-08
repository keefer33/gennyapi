import axios from 'axios';
import { AppError } from '../../app/error';

export async function runPlaygroundWavespeed(endpoint: string, apiKey: string, payload: unknown) {
  console.log('Running playground wavespeed', endpoint);
  console.log('Payload', payload);
  console.log('API Key', apiKey);
  console.log('Webhook URL', process.env.WAVESPEED_WEBHOOK_URL);
  const response = await axios.post(`${endpoint}?webhook=${process.env.WAVESPEED_WEBHOOK_URL}`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  });
  console.log('Response status', response);
  if (response.status !== 200) {
    console.error('Failed to run playground wavespeed', response.data);
    throw new AppError('Failed to run playground wavespeed', {
      statusCode: response.status,
      code: 'failed_to_run_playground_wavespeed',
      expose: true,
    });
  }
  console.log('Response', response.data);
  return response.data?.data ?? null;
}