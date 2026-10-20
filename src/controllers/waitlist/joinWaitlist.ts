import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { insertWaitlistEmail } from '../../database/waitlist';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /waitlist
 * Body: { email }
 * Public. Duplicate emails still return 200.
 */
export async function joinWaitlist(req: Request, res: Response): Promise<void> {
  try {
    const raw = (req.body ?? {}) as { email?: unknown };
    if (typeof raw.email !== 'string') {
      throw badRequest('email is required');
    }
    const email = raw.email.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      throw badRequest('A valid email is required');
    }

    await insertWaitlistEmail(email);
    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
