import { SignIn } from "@clerk/nextjs";
import { ClerkAuthShell } from "@/app/components/clerk-auth-shell";

export default function SignInPage() {
  return (
    <ClerkAuthShell>
      <SignIn forceRedirectUrl="/" fallbackRedirectUrl="/" />
    </ClerkAuthShell>
  );
}
