/** Safe, fixed error categories for a Google Drive OAuth callback.
 * Do not forward Google's response bodies, codes or credentials to the browser.
 */
export type DriveConnectionCode =
  | "invalid_origin" | "session_missing" | "oauth_denied" | "callback_incomplete"
  | "state_cookie_missing" | "state_expired" | "server_config"
  | "token_exchange" | "missing_refresh_token" | "missing_scope"
  | "drive_api_disabled" | "drive_access_denied" | "drive_api_unavailable"
  | "secure_storage_error" | "database_error" | "unexpected";

export class DriveConnectionFailure extends Error {
  readonly code: DriveConnectionCode;
  constructor(code: DriveConnectionCode) {
    super("Google Drive connection failed at " + code);
    this.code = code;
    this.name = "DriveConnectionFailure";
  }
}

/** Only known Google structured reason codes may classify disabled APIs.
 * Never trust/echo arbitrary provider message text, including service URLs.
 */
export function classifyDriveAboutError(httpStatus: number, responseBody: unknown): DriveConnectionCode {
  if (httpStatus === 403 && responseBody && typeof responseBody === "object") {
    const error = (responseBody as { error?: unknown }).error;
    if (error && typeof error === "object") {
      const details = (error as { details?: unknown }).details;
      const errors = (error as { errors?: unknown }).errors;
      const reasons: unknown[] = [];
      if (Array.isArray(details)) for (const detail of details) {
        if (detail && typeof detail === "object") reasons.push((detail as { reason?: unknown }).reason);
      }
      if (Array.isArray(errors)) for (const item of errors) {
        if (item && typeof item === "object") reasons.push((item as { reason?: unknown }).reason);
      }
      if (reasons.some(reason => reason === "SERVICE_DISABLED" || reason === "accessNotConfigured")) {
        return "drive_api_disabled";
      }
    }
  }
  if (httpStatus === 401 || httpStatus === 403) return "drive_access_denied";
  return "drive_api_unavailable";
}
