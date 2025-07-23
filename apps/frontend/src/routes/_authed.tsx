import { Button } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { authClient } from "@/lib/auth-client";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    // do not let in users unless they are admins or editors
    if (!context.user) {
      throw new Error("notAuthenticated");
    }
    if (context.user.role !== "admin" && context.user.role !== "editor") {
      throw new Error("notAuthorized");
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

    if (error.message === "notAuthenticated") {
      return (
        <Layout>
          <div className="flex flex-col items-center justify-center p-12">
            <p>Please login here</p>
            <Button onClick={handleLogin}> Login with GitHub </Button>
          </div>
        </Layout>
      );
    }

    if (error.message === "notAuthorized") {
      return (
        <Layout>
          <div className="flex items-center justify-center p-12">
            <p>
              You are not authorized to access this section. Ask for your
              administrator to give you access rights.
            </p>
          </div>
        </Layout>
      );
    }

    throw error;
  },

  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-screen flex-col gap-2 p-4">
      <Navbar />
      {children}
      <Footer />
    </main>
  );
}
