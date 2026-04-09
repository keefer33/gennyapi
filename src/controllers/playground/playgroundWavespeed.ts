import axios from 'axios';
import { AppError } from '../../app/error';

export async function runPlaygroundWavespeed(endpoint: string, apiKey: string, payload: unknown) {
  console.log('Webhook URL', process.env.WAVESPEED_WEBHOOK_URL);
  const response = await axios.post(`${endpoint}?webhook=${process.env.WAVESPEED_WEBHOOK_URL}`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.status !== 200) {
    console.error('Failed to run playground wavespeed', response.data);
    throw new AppError('Failed to run playground wavespeed', {
      statusCode: response.status,
      code: 'failed_to_run_playground_wavespeed',
      expose: true,
    });
  }

  return response.data?.data ?? null;
}
