import { SignUp } from "@clerk/nextjs";
import { ClerkAuthShell } from "@/app/components/clerk-auth-shell";

export default function SignUpPage() {
  return (
    <ClerkAuthShell>
      <SignUp forceRedirectUrl="/" fallbackRedirectUrl="/" />
    </ClerkAuthShell>
  );
}
