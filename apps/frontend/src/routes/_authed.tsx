import { Button } from "@/components/Button";
import { authClient } from "@/lib/auth-client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw new Error("Not authenticated");
    }
    console.log("context.user", context.user);
  },
  errorComponent: ({ error }) => {
    async function handleLogin() {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/admin",
        errorCallbackURL: "/login-error",
      });
    }

    if (error.message === "Not authenticated") {
      return (
        <div className="flex items-center justify-center p-12">
          <Button onClick={handleLogin}> Login with GitHub </Button>
        </div>
      );
    }

    throw error;
  },
});
