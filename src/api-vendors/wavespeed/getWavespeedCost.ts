import { AppError } from "../../app/error";
import axios from 'axios';

export async function getWavespeedCost(
    modelId: string | null,
    payload: Record<string, unknown>,
    apiKey: string,
    costApiEndpoint: string | null
  ): Promise<number> {
    const response = await axios.post(
      costApiEndpoint,
      {
        model_id: modelId,
        inputs: payload,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (response.status !== 200) {
      throw new AppError('Failed to get wavespeed cost', {
        statusCode: response.status,
        code: 'failed_to_get_wavespeed_cost',
        expose: true,
      });
    }
    return response.data.data.unit_price;
  }