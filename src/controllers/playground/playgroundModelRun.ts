import axios, { isAxiosError } from 'axios';
import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { createUserGenModelRun } from '../../database/user_gen_model_runs';
import { getWavespeedCost } from '../../api-vendors/wavespeed/getWavespeedCost';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getGenModelById } from '../../database/gen_models';
import { runWavespeedModel } from '../../api-vendors/wavespeed/runWavespeedModel';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { USAGE_LOG_TYPE_AI_MODEL_USAGE } from '../../database/const';
import { updateUserUsageBalance } from '../../database/user_profiles';
import { runXaiModel } from '../../api-vendors/xai/runXaiModel';
import { getVendorApiKeyByVendorName } from '../../database/vendor_apis';

export async function playgroundModelRun(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = req.body as { id?: unknown; payload?: unknown };
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const payload = body.payload as Record<string, unknown>;
    if (!id) {
      throw badRequest('id is required');
    }
    if (body.payload === undefined) {
      throw badRequest('payload is required');
    }

    const genModel = await getGenModelById(id);

    let response = null;
    let cost: number = 0;
    switch (genModel.gen_models_apis_id?.vendor_api?.vendor_name) {
      case 'xai':
        response = await runXaiModel(genModel, payload);
        const xaiVendorApiKey = await getVendorApiKeyByVendorName('wavespeed');
        cost = await getWavespeedCost(
          genModel.model_id,
          payload,
          xaiVendorApiKey.api_key ?? null,
          xaiVendorApiKey.config?.cost_api_endpoint ?? null
        );
        break;
      case 'wavespeed':
        response = await runWavespeedModel(genModel, payload);
        cost = await getWavespeedCost(
          genModel.model_id,
          payload,
          genModel.gen_models_apis_id?.vendor_api?.api_key ?? null,
          genModel.gen_models_apis_id?.vendor_api?.config?.cost_api_endpoint ?? null
        );
        break;
      default:
        throw new AppError('Invalid vendor', {
          statusCode: 400,
          code: 'invalid_vendor',
          expose: true,
        });
        break;
    }

    const genModelRun = await createUserGenModelRun({
      user_id: userId,
      gen_model_id: genModel.id,
      payload: body.payload,
      response: response,
      cost: cost,
      task_id: response?.id ?? null,
      status: 'pending',
    });

    await insertUserUsageLog({
      user_id: userId,
      usage_amount: cost,
      type_id: USAGE_LOG_TYPE_AI_MODEL_USAGE,
      gen_model_run_id: genModelRun.id,
      transaction_id: null,
      meta: {
        model_name: genModel.model_name ?? '',
        type: 'playground',
        usage: {
          reason_code: 'playground',
          amount_dollars: cost,
        },
      },
    });

    await updateUserUsageBalance(userId, cost, 'debit');

    sendOk(res, response);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      sendError(
        res,
        new AppError('Upstream request failed', {
          statusCode: err.response.status >= 400 && err.response.status < 600 ? err.response.status : 502,
          code: 'upstream_error',
          details: err.response.data,
          expose: true,
        })
      );
      return;
    }
    sendError(res, err);
  }
}
