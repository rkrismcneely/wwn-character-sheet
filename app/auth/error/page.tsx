import Link from "next/link";
import { authErrorMessage } from "@/lib/auth-providers";
import "../../account/account.css";

export default async function AuthenticationError({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const params = await searchParams;
  return <main className="account-shell"><section className="account-panel">
    <h1>Authentication could not be completed</h1>
    <p role="alert">{authErrorMessage(typeof params.error === "string" ? params.error : undefined)}</p>
    <div className="account-actions"><Link href="/account">Return to Account</Link><Link href="/">Return to sign-in</Link></div>
  </section></main>;
}
