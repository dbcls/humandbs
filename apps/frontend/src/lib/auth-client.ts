import { createAuthClient } from "better-auth/client";
import type { auth } from "./auth.ts";
import { inferAdditionalFields, adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>(), adminClient()],
});
