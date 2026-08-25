import type { SessionActor } from "../auth-session.ts";
import {
  DisplayNameValidationError,
  effectiveDisplayName,
  normalizeDisplayName,
} from "./display-name.ts";

export type AccountProfileStatus = 401 | 404 | 422;

export class AccountProfileError extends Error {
  public readonly status: AccountProfileStatus;

  constructor(message: string, status: AccountProfileStatus) {
    super(message);
    this.status = status;
  }
}

interface AccountProfileRow {
  providerName: string;
  customDisplayName: string | null;
  email: string;
}

export interface AccountProfilePayload {
  providerName: string;
  displayName: string | null;
  effectiveDisplayName: string;
  email: string;
  usesProviderName: boolean;
}

function requireActor(actor: SessionActor | null): SessionActor {
  if (!actor) throw new AccountProfileError("Sign in is required.", 401);
  return actor;
}

function profilePayload(row: AccountProfileRow): AccountProfilePayload {
  return {
    providerName: row.providerName,
    displayName: row.customDisplayName,
    effectiveDisplayName: effectiveDisplayName(
      row.customDisplayName,
      row.providerName,
    ),
    email: row.email,
    usesProviderName: !row.customDisplayName?.trim(),
  };
}

export async function getAccountD1(): Promise<D1Database> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Account database is unavailable.");
  return env.DB;
}

export async function readAccountProfile(
  db: D1Database,
  actor: SessionActor | null,
): Promise<AccountProfilePayload> {
  const authenticatedActor = requireActor(actor);
  const row = await db
    .prepare(
      `SELECT name AS providerName, display_name AS customDisplayName, email
       FROM user
       WHERE id = ?`,
    )
    .bind(authenticatedActor.userId)
    .first<AccountProfileRow>();
  if (!row) throw new AccountProfileError("Account not found.", 404);
  return profilePayload(row);
}

export async function updateAccountDisplayName(
  db: D1Database,
  actor: SessionActor | null,
  value: unknown,
  now = Date.now(),
): Promise<AccountProfilePayload> {
  const authenticatedActor = requireActor(actor);
  let displayName: string;
  try {
    displayName = normalizeDisplayName(value);
  } catch (error) {
    if (error instanceof DisplayNameValidationError) {
      throw new AccountProfileError(error.message, 422);
    }
    throw error;
  }
  const row = await db
    .prepare(
      `UPDATE user
       SET display_name = ?, updated_at = ?
       WHERE id = ?
       RETURNING name AS providerName, display_name AS customDisplayName, email`,
    )
    .bind(displayName, now, authenticatedActor.userId)
    .first<AccountProfileRow>();
  if (!row) {
    throw new AccountProfileError("Account not found.", 404);
  }
  return profilePayload(row);
}

export async function resetAccountDisplayName(
  db: D1Database,
  actor: SessionActor | null,
  now = Date.now(),
): Promise<AccountProfilePayload> {
  const authenticatedActor = requireActor(actor);
  const row = await db
    .prepare(
      `UPDATE user
       SET display_name = NULL, updated_at = ?
       WHERE id = ?
       RETURNING name AS providerName, display_name AS customDisplayName, email`,
    )
    .bind(now, authenticatedActor.userId)
    .first<AccountProfileRow>();
  if (!row) {
    throw new AccountProfileError("Account not found.", 404);
  }
  return profilePayload(row);
}
