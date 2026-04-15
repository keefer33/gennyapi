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

/**
 * PATCH /user/profile
 * Body: { first_name, last_name, bio, username }
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

    const existing = await readUserProfile(userId,'id, username');

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
    const payload = {
      first_name,
      last_name,
      bio,
      username: usernameRaw,
      updated_at: now,
    };

    if (existing?.id) {
      await updateUserProfile(userId, payload);
    } else {
      await createUserProfile({
        user_id: userId,
        first_name: first_name ?? '',
        last_name: last_name ?? '',
        bio: bio ?? '',
        username: usernameRaw ?? '',
      });
    }

    const profile = await readUserProfile(userId);
    sendOk(res, { profile });
  } catch (error) {
    sendError(res, error);
  }
}
