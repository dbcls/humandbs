import { PanelLeftClose, PanelRight } from "lucide-react";

import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { AssetsBrowser, AssetsBrowserFallback } from "./AssetsBrowser";

export function AssetsPanel() {
  const [assetsOpen, setAssetsOpen] = useState(false);

  return (
    <div
      className={cn("relative flex min-h-0 w-12 flex-col rounded-sm bg-white transition-all", {
        "w-cms-assets-panel": assetsOpen,
      })}
    >
      <Button
        onClick={() => setAssetsOpen((prev) => !prev)}
        className={cn("flex gap-2 text-black", { "flex-col": !assetsOpen })}
        variant={"plain"}
        size={"slim"}
      >
        {assetsOpen ? <PanelLeftClose /> : <PanelRight />}

        <Label
          className={cn("origin-left", {
            "translate-x-8 -translate-y-2 rotate-90": !assetsOpen,
          })}
        >
          Assets
        </Label>
      </Button>
      {assetsOpen ? (
        <Suspense fallback={<AssetsBrowserFallback />}>
          <AssetsBrowser />
        </Suspense>
      ) : null}
    </div>
  );
}
