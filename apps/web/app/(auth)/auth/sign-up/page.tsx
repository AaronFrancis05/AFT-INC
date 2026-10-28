import { SignUp } from "@/components/auth";
import { authEnv } from "@aft/auth/env";
import { resolveSocialProviders } from "@aft/auth/providers";

// Read the provider keys on every request, so one build works in every environment.
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return <SignUp socialProviders={resolveSocialProviders(authEnv()).enabled} />;
}
