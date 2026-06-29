import type { ReactNode } from "react";
import { Suspense } from "react";

import { useTranslations } from "use-intl";

import { LangSwitcherPill } from "@/components/LanguageSwitcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/config/i18n";

/**
 * Shared big-modal shell for admin previews (research, dataset, flowchart).
 *
 * Sized like the document-diff modal (`max-h-[90vh] max-w-[90vw]`) so it takes
 * up almost all the screen. The language switcher lives in the header, next to
 * the title, so each preview surface no longer needs its own inline pill.
 */
export function PreviewDialog({
  open,
  onOpenChange,
  title,
  lang,
  onLangChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  lang: Locale;
  onLangChange: (lang: Locale) => void;
  children: ReactNode;
}) {
  const tMd = useTranslations("admin.markdown");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[90vw] max-w-[90vw] flex-col items-stretch gap-0 p-0">
        <DialogHeader className="flex shrink-0 flex-row items-center gap-4 border-b py-4 pr-16 pl-5">
          <DialogTitle className="mr-auto">{title}</DialogTitle>
          <LangSwitcherPill value={lang} onChange={onLangChange} />
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">
          <Suspense
            fallback={
              <div className="px-5 py-8 text-center text-gray-400 text-sm">{tMd("loading-preview")}</div>
            }
          >
            {children}
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
