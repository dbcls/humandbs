import { Button } from "@/components/Button";
import { ContentId } from "@/lib/content-config";
import { db } from "@/lib/database";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useTranslations } from "use-intl";

const getDocuments = createServerFn({ type: "dynamic", method: "GET" }).handler(
  async () => {
    const documents = await db.query.document.findMany();

    return documents;
  }
);

// const getDocument = createServerFn({ method: "GET" }).handler(
//   async (contentId: string) => {
//     /// const document = await db.query.documentVersion.findFirst({where})
//   }
// );

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
  loader: async () => await getDocuments(),
});

function RouteComponent() {
  const documents = Route.useLoaderData();

  const t = useTranslations("Navbar");
  return (
    <section className="flex items-stretch gap-2">
      <ul className="bg-primary max-w-md space-y-4 p-4">
        {documents.map((doc) => (
          <li key={doc.id}>
            <Button variant={"toggle"}>{t(doc.contentId as any)}</Button>
          </li>
        ))}
      </ul>
      <div className="border-primary"></div>
    </section>
  );
}
