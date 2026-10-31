import { decryptDriveRefreshToken, driveOAuthClient, requireDriveConfiguration, type DriveSettings } from "../account/recap-google-drive-oauth.ts";
import { CampaignServiceError } from "./service.ts";

type StoredConnection = {
  ciphertext: string | null; nonce: string | null; version: number | null;
  status: "connected" | "disconnected" | "reconnect_required";
};
export async function getGmDriveAccessToken(
  db: D1Database, settings: DriveSettings, userId: string, connectionId: string,
): Promise<string> {
  requireDriveConfiguration(settings);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(connectionId)) {
    throw new CampaignServiceError("Choose a valid Google Drive connection.", 422);
  }
  const row = await db.prepare(
    "SELECT credential_ciphertext AS ciphertext,credential_nonce AS nonce," +
    "credential_version AS version,status FROM user_recap_storage_connections " +
    "WHERE id=? AND user_id=? AND provider='google-drive'",
  ).bind(connectionId,userId).first<StoredConnection>();
  if (!row || row.status !== "connected" || !row.ciphertext || !row.nonce || row.version !== 1) {
    throw new CampaignServiceError("Reconnect your own Google Drive account.", 409);
  }
  let refreshToken: string;
  try {
    refreshToken = await decryptDriveRefreshToken(settings,userId,connectionId,{
      ciphertext:row.ciphertext,nonce:row.nonce,version:row.version,
    });
  } catch {
    throw new CampaignServiceError("Google Drive credentials cannot be read. Reconnect the account.", 409);
  }
  const response = await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      client_id:driveOAuthClient(settings)!.clientId,
      client_secret:driveOAuthClient(settings)!.clientSecret,
      grant_type:"refresh_token",refresh_token:refreshToken,
    }),
    signal:AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      await db.prepare("UPDATE user_recap_storage_connections SET status='reconnect_required',updated_at=? WHERE id=? AND user_id=?")
        .bind(new Date().toISOString(),connectionId,userId).run();
      throw new CampaignServiceError("Google Drive permission expired. Reconnect it in Account settings.", 409);
    }
    throw new CampaignServiceError("Google Drive is temporarily unavailable.", 409);
  }
  const token = await response.json() as {access_token?:unknown;token_type?:unknown};
  if(typeof token.access_token !== "string" || !token.access_token || token.token_type !== "Bearer") {
    throw new CampaignServiceError("Google Drive did not supply a usable access token.",409);
  }
  return token.access_token;
}
