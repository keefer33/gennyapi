import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listBrands } from '../../database/brands';


export async function getBrands(req: Request, res: Response): Promise<void> {
  try {
    const data = await listBrands();
    sendOk(res, data);
  } catch (err) {
    sendError(res, err);
  }
}