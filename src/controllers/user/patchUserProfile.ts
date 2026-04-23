import { Request, Response } from "express";
import { AppError } from "../../app/error";
import { badRequest, sendError, sendOk } from "../../app/response";
import {
  countUserProfilesWithUsernameExcludingUser,
  createUserProfile,
  readUserProfile,
  updateUserProfile,
} from "../../database/user_profiles";
import { getAuthUserId } from "../../shared/getAuthUserId";
import type { UserProfileRow } from "../../database/types";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * PATCH /user/profile
 * Body: { first_name, last_name, bio, username, model_history? }
 * Optional `model_history` is deep-merged into `user_profiles.meta.model_history`.
 * Authorization: Bearer <app JWT from createToken>
 *
 * Validates username uniqueness (excluding current user), then updates or inserts user_profiles.
 */
export async function patchUserProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const body = req.body ?? {};
    const first_name = typeof body.first_name === "string" ? body.first_name : "";
    const last_name = typeof body.last_name === "string" ? body.last_name : "";
    const bio = typeof body.bio === "string" ? body.bio : "";
    const usernameRaw = typeof body.username === "string" ? body.username.trim() : "";

    if (!usernameRaw) {
      throw badRequest("Username is required");
    }

    const existing = await readUserProfile(userId, "id, username, meta");

    const currentUsername = (existing?.username ?? "").trim();
    if (usernameRaw !== currentUsername) {
      const count = await countUserProfilesWithUsernameExcludingUser(usernameRaw, userId);
      if (count > 0) {
        throw new AppError("Username is already taken", {
          statusCode: 409,
          code: "username_conflict",
        });
      }
    }

    const now = new Date().toISOString();
    const payload: UserProfileRow = {
      first_name,
      last_name,
      bio,
      username: usernameRaw,
      updated_at: now,
    };

    const bodyModelHistory = body.model_history;
    if (bodyModelHistory !== undefined && isPlainObject(bodyModelHistory)) {
      const prevMeta = isPlainObject(existing.meta) ? { ...existing.meta } : {};
      const prevMH = isPlainObject(prevMeta.model_history) ? { ...prevMeta.model_history } : {};
      const mergedMH = { ...prevMH };
      for (const [key, val] of Object.entries(bodyModelHistory)) {
        if (!isPlainObject(val)) continue;
        const prevEntry = isPlainObject(mergedMH[key])
          ? { ...(mergedMH[key] as Record<string, unknown>) }
          : {};
        mergedMH[key] = { ...prevEntry, ...val };
      }
      payload.meta = { ...prevMeta, model_history: mergedMH };
    }

    if (existing?.id) {
      await updateUserProfile(userId, payload);
    } else {
      await createUserProfile({
        user_id: userId,
        first_name: first_name ?? "",
        last_name: last_name ?? "",
        bio: bio ?? "",
        username: usernameRaw ?? "",
        ...(payload.meta !== undefined ? { meta: payload.meta } : {}),
      });
    }

    const profile = await readUserProfile(userId);
    sendOk(res, { profile });
  } catch (error) {
    sendError(res, error);
  }
}
