import axios, { isAxiosError } from 'axios';
import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { createUserGenModelRun, getPlaygroundModel, getVendorApiKeyByServer } from './playgroundData';
import { getWavespeedCost, joinServerAndPath, parseApiSchema } from './playgroundUtils';
import { runPlaygroundWavespeed } from './playgroundWavespeed';
import { getAuthUserId } from '../../shared/getAuthUserId';

export async function runPlaygroundModel(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = req.body as { id?: unknown; payload?: unknown };
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) {
      throw badRequest('id is required');
    }
    if (body.payload === undefined) {
      throw badRequest('payload is required');
    }

    const row = await getPlaygroundModel(id);

    const parsed = parseApiSchema(row.api_schema);
    const server = typeof parsed?.server === 'string' ? parsed.server.trim() : '';
    const apiPath = typeof parsed?.api_path === 'string' ? parsed.api_path.trim() : '';
    if (!server || !apiPath) {
      throw new AppError('Invalid or missing api_schema.server / api_schema.api_path', {
        statusCode: 400,
        code: 'invalid_api_schema',
        expose: true,
      });
    }

    const endpoint = joinServerAndPath(server, apiPath);

    const { apiKey, vendor } = await getVendorApiKeyByServer(server);

    let response: unknown | any;
    let cost: number = 0;
    switch (vendor) {
      case 'kie':
        break;
      case 'wavespeed':
        console.log('Running playground wavespeed', endpoint);
        response = await runPlaygroundWavespeed(endpoint, apiKey, body.payload as Record<string, unknown>);
        cost = await getWavespeedCost(row.model_id, body.payload as Record<string, unknown>, apiKey);
        break;
      default:
        throw new AppError('Invalid vendor', {
          statusCode: 400,
          code: 'invalid_vendor',
          expose: true,
        });
        break;
    }

    await createUserGenModelRun({
      user_id: userId,
      gen_model_id: row.id,
      payload: body.payload,
      response: response,
      cost: cost,
      generation_type: vendor,
      task_id: response?.id,
      status: 'pending',
    });
 

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
