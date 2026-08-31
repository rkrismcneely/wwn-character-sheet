export const AUTH_PROVIDERS = ["google", "discord"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];
export type ProviderConfiguration = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
};

export function configuredProviders(env: ProviderConfiguration): AuthProvider[] {
  return AUTH_PROVIDERS.filter(provider => {
    const prefix = provider === "google" ? "GOOGLE" : "DISCORD";
    return Boolean(env[`${prefix}_CLIENT_ID`]?.trim() && env[`${prefix}_CLIENT_SECRET`]?.trim());
  });
}

export function providerName(provider: AuthProvider): string {
  return provider === "google" ? "Google" : "Discord";
}

/** Only fixed, non-sensitive messages are ever rendered from OAuth errors. */
export function authErrorMessage(code?: string | null): string {
  switch (code?.toLowerCase()) {
    case "access_denied": return "Sign-in was canceled. No connected accounts were changed.";
    case "account_not_linked": return "An account already exists for this email. Sign in with your existing method, then connect the new method from Account.";
    case "account_already_linked_to_different_user":
    case "account_already_connected": return "That sign-in method is already connected. No accounts were merged or moved.";
    case "email_not_found":
    case "discord_email_required": return "Discord did not provide a usable verified email. Add and verify an email in Discord before creating a new account, or sign in with your existing method and connect Discord from Account.";
    case "failed_to_unlink_last_account": return "Connect another available sign-in method before disconnecting this one.";
    case "session_expired":
    case "session_not_fresh":
    case "unauthorized":
    case "link_session_changed": return "Please sign in again, then return to Account to connect or disconnect a sign-in method.";
    case "provider_not_found":
    case "oauth_provider_not_found": return "That sign-in method is currently unavailable. Please use another connected method.";
    default: return "Authentication could not be completed. Please try again. No accounts were merged or moved.";
  }
}
