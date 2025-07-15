import { Button } from "@/components/Button";
import { authClient } from "@/lib/auth-client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    // do not let in users unless they are admins or editors
    if (!context.user) {
      throw new Error("In order to enter this section, you need to login", {
        cause: "notAuthed",
      });
    }
    if (context.user.role !== "admin" && context.user.role !== "editor") {
      throw new Error("You are not authorized to access this section", {
        cause: "notAuthorized",
      });
    }
  },
  errorComponent: ({ error }) => {
    async function handleLogin() {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/admin",
        errorCallbackURL: "/login-error",
      });
    }

    if (error.cause === "notAuthed") {
      return (
        <div className="flex flex-col items-center justify-center p-12">
          <p>Please login here</p>
          <Button onClick={handleLogin}> Login with GitHub </Button>
        </div>
      );
    }

    if (error.cause === "notAuthorized") {
      return (
        <div className="flex items-center justify-center p-12">
          <p>
            You are not authorized to access this section. Ask for your
            administrator to give you access rights.
          </p>
        </div>
      );
    }

    throw error;
  },
});
