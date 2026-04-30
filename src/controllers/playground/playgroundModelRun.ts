import { isAxiosError } from 'axios';
import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { createUserGenModelRun } from '../../database/user_gen_model_runs';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getGenModelById } from '../../database/gen_models';
import { runWavespeedModel } from '../../api-vendors/wavespeed/runWavespeedModel';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { USAGE_LOG_TYPE_AI_MODEL_USAGE } from '../../database/const';
import { updateUserUsageBalance } from '../../database/user_profiles';
import { runXaiModel } from '../../api-vendors/xai/runXaiModel';
import { runKieModel } from '../../api-vendors/kie/runKieModel';
import { runOpenaiModel } from '../../api-vendors/openai/runOpenaiModel';
import { runGoogleModel } from '../../api-vendors/google/runGoogleModel';
import { runAlibabaModel } from '../../api-vendors/alibaba/runAlibabaModel';
import { calculatePlaygroundRunCost } from './calculatePlaygroundRunCost';

type PlaygroundApiSchema = {
  type?: unknown;
  vendor_model_name?: unknown;
  server?: unknown;
  api_path?: unknown;
};

function instantModelResponse(genModel: Awaited<ReturnType<typeof getGenModelById>>) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema ?? {}) as PlaygroundApiSchema;
  const vendorName = genModel.gen_models_apis_id?.vendor_api?.vendor_name ?? 'instant';
  const vendorModelName = typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';

  return {
    id: `${vendorName}-instant-${Date.now()}`,
    request_id: null,
    status: 'pending',
    deferred_to_webhook: true,
    model: vendorModelName,
  };
}

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
    const apiSchema = (genModel.gen_models_apis_id?.api_schema ?? {}) as PlaygroundApiSchema;
    const apiSchemaType = typeof apiSchema.type === 'string' ? apiSchema.type.trim().toLowerCase() : '';

    let response = null;
    if (apiSchemaType === 'instant') {
      response = instantModelResponse(genModel);
    } else {
      switch (genModel.gen_models_apis_id?.vendor_api?.vendor_name) {
        case 'xai':
          response = await runXaiModel({
            payload,
            server: typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '',
            apiPath: typeof apiSchema.api_path === 'string' ? apiSchema.api_path.trim() : '',
            apiKey: genModel.gen_models_apis_id?.vendor_api?.api_key ?? null,
            vendorModelName: typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '',
          });
          break;
        case 'wavespeed':
          response = await runWavespeedModel(genModel, payload);
          break;
        case 'kie':
          response = await runKieModel(genModel, payload);
          break;
        case 'openai':
          response = await runOpenaiModel(genModel, payload);
          break;
        case 'google':
          response = await runGoogleModel(genModel, payload);
          break;
        case 'alibaba':
          response = await runAlibabaModel(genModel, payload);
          break;
        default:
          throw new AppError('Invalid vendor', {
            statusCode: 400,
            code: 'invalid_vendor',
            expose: true,
          });
          break;
      }
    }
    const cost = await calculatePlaygroundRunCost(genModel, payload);

    const genModelRun = await createUserGenModelRun({
      user_id: userId,
      gen_model_id: genModel.id,
      payload: body.payload,
      response: response,
      cost: cost,
      task_id: response?.id || response?.taskId || null,
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

    sendOk(res, genModelRun);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      console.log(err);
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
