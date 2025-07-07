import { db } from "@/lib/database";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getDocuments = createServerFn({ type: "dynamic", method: "GET" }).handler(
  async () => {
    console.log("hello serverFn");
    const documents = await db.query.document.findMany();

    console.log("documents", documents);

    return documents;
  }
);

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
  loader: async () => await getDocuments(),
});

function RouteComponent() {
  const { user } = Route.useRouteContext();

  const documents = Route.useLoaderData();

  return (
    <section>
      <h2>Welcome {user?.name}</h2>

      <ul>
        {documents.map((doc) => (
          <li key={doc.id}>{doc.name}</li>
        ))}
      </ul>
    </section>
  );
}
