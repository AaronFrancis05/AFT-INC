import { SignIn } from "@/components/auth";
import { resolveSocialProviders } from "@/lib/auth-providers";

// Read the provider keys on every request, so one build works in every environment.
export const dynamic = "force-dynamic";

export default function SignInPage() {
  return <SignIn socialProviders={resolveSocialProviders().enabled} />;
}
