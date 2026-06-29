import { Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

export function NotFound({ children }: { children?: any }) {
  const t = useTranslations("common");

  return (
    <div className="space-y-2 p-2">
      <div className="text-gray-600 dark:text-gray-400">
        {children || <p>{t("page-not-found")}</p>}
      </div>
      <p className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-sm bg-secondary px-2 py-1 font-black text-sm text-white uppercase"
        >
          Go back
        </button>
        <Link
          to="/{-$lang}"
          className="rounded-sm bg-accent-light px-2 py-1 font-black text-sm text-white uppercase"
        >
          Start Over
        </Link>
      </p>
    </div>
  );
}
