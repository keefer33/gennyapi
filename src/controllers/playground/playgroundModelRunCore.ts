import { isAxiosError } from 'axios';
import { AppError } from '../../app/error';
import { badRequest, notFound } from '../../app/response';
import { createUserGenModelRun } from '../../database/user_gen_model_runs';
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
import { runEachlabsModel } from '../../api-vendors/eachlabs/runEachlabsModel';
import { runPrunaaiModel } from '../../api-vendors/prunaai/runPrunaaiModel';
import { runKlingModel } from '../../api-vendors/kling/runKlingModel';
import { runSkyreelsModel } from '../../api-vendors/skyreels/runSkyreelsModel';
import { runLtxModel } from '../../api-vendors/ltx/runLtxModel';
import { calculatePlaygroundRunCost } from './calculatePlaygroundRunCost';
import { startGenModelRunPolling } from '../../shared/startGenModelRunPolling';

type PlaygroundApiSchema = {
  type?: unknown;
  vendor_model_name?: unknown;
  server?: unknown;
  api_path?: unknown;
};

function instantModelResponse(genModel: NonNullable<Awaited<ReturnType<typeof getGenModelById>>>) {
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

/**
 * Core playground run: vendor call, persist run, usage log, balance debit.
 * Used by POST /playground/run and agent generation tools (no HTTP self-call).
 */
export async function executePlaygroundModelRun(
  userId: string,
  modelId: string,
  payload: Record<string, unknown>,
  app: string = 'playground',
  characterId: string | null = null
): Promise<Awaited<ReturnType<typeof createUserGenModelRun>>> {
  const id = typeof modelId === 'string' ? modelId.trim() : '';
  if (!id) {
    throw badRequest('id is required');
  }

  try {
    const genModel = await getGenModelById(id);
    if (!genModel) {
      throw notFound('Model not found');
    }

    const apiSchema = (genModel.gen_models_apis_id?.api_schema ?? {}) as PlaygroundApiSchema;
    const apiSchemaType = typeof apiSchema.type === 'string' ? apiSchema.type.trim().toLowerCase() : '';

    let response: unknown = null;
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
        case 'eachlabs':
          response = await runEachlabsModel(genModel, payload);
          break;
        case 'prunaai':
          response = await runPrunaaiModel(genModel, payload);
          break;
        case 'kling':
          response = await runKlingModel(genModel, payload);
          break;
        case 'skyreels':
          response = await runSkyreelsModel(genModel, payload);
          break;
        case 'ltx':
          response = await runLtxModel(genModel, payload);
          break;
        default:
          throw new AppError('Invalid vendor', {
            statusCode: 400,
            code: 'invalid_vendor',
            expose: true,
          });
      }
    }

    const cost = await calculatePlaygroundRunCost(genModel, payload);

    const respObj = response as { id?: string; taskId?: string } | null;
    const genModelRun = await createUserGenModelRun({
      user_id: userId,
      gen_model_id: genModel.id,
      payload,
      response,
      cost,
      task_id: respObj?.id || respObj?.taskId || null,
      status: 'pending',
      app: app,
      character_id: characterId,
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

    if (genModelRun.id) {
      startGenModelRunPolling(userId, genModelRun.id);
    }

    return genModelRun;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response) {
      throw new AppError('Upstream request failed', {
        statusCode: err.response.status >= 400 && err.response.status < 600 ? err.response.status : 502,
        code: 'upstream_error',
        details: err.response.data,
        expose: true,
      });
    }
    throw err;
  }
}
