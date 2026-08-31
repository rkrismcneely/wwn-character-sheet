import { createRoot } from "react-dom/client";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/jost/600.css";
import "@fontsource/jost/700.css";
import { ConnectedAccounts } from "../../app/account/connected-accounts";
import { DiscordSignInButton } from "../../components/discord-sign-in-button";
import { GoogleSignInButton } from "../../components/google-sign-in-button";
import { LandingPage } from "../../app/landing-page";
import "../../app/globals.css";
import "../../app/app-header.css";
import "../../app/account/account.css";

createRoot(document.getElementById("root")!).render(location.pathname === "/landing" ? <LandingPage /> : <main className="account-shell">
  <h1>Account · local test fixture</h1>
  <ConnectedAccounts />
  <section className="account-panel"><h2>Sign-in controls</h2><div className="account-actions">
    <GoogleSignInButton className="account-secondary">Continue with Google</GoogleSignInButton>
    <DiscordSignInButton className="account-secondary" />
  </div></section>
</main>);
