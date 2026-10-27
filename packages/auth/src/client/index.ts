import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// No baseURL: the browser calls /api/auth on the page's own origin, so the
// same build works on localhost, previews, and remwa.tech (spec 0002).
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
