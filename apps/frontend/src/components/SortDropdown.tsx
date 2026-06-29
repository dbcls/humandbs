import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";
import { buttonVariants } from "./ui/button";

interface SortOption {
  label: string;
  value: string;
}

export function SortDropdown({
  onSelect,
  options,
  sort,
  order,
}: {
  onSelect: (x: { sort: string; order: "asc" | "desc" }) => void;
  options: SortOption[];
  sort: string | undefined;
  order: "asc" | "desc" | undefined;
}) {
  const t = useTranslations("common");
  const currentSort = sort && options.some((o) => o.value === sort) ? sort : options[0]?.value ?? "";
  const currentOrder = order ?? "asc";
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeOption = options.find((o) => o.value === currentSort);

  const handleSortChange = (newSort: string) => {
    onSelect({ sort: newSort, order: currentOrder });
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleOrderToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newOrder = currentOrder === "asc" ? "desc" : "asc";
    onSelect({ sort: currentSort, order: newOrder });
  };

  useEffect(() => {
    function handleOutsideClick(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const items = containerRef.current?.querySelectorAll('[role="option"]');
    if (!items || items.length === 0) return;

    const activeEl = document.activeElement;
    const currentIndex = Array.from(items).indexOf(activeEl as Element);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % items.length;
      (items[nextIndex] as HTMLElement).focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const nextIndex =
        currentIndex === -1 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      (items[nextIndex] as HTMLElement).focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="flex items-center gap-2" onKeyDown={handleKeyDown}>
      <span className="font-semibold text-secondary-light select-none text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
        {t("sort")}
      </span>
      <div className="relative" ref={containerRef}>
        <div
          className={cn(
            buttonVariants({ variant: "captionAction", size: "captionAction" }),
            "p-0 overflow-hidden font-normal select-none transition-colors cursor-default",
            isOpen ? "border-secondary" : "",
          )}
        >
          {/* 左側：セレクトトリガー部分 */}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            className={cn(
              "flex items-center gap-1.5 h-full pl-4 pr-2.5 cursor-pointer transition-colors text-xs font-semibold select-none border-none bg-transparent outline-none focus-visible:bg-hover",
              isOpen
                ? "bg-secondary text-white focus-visible:bg-secondary/90"
                : "text-secondary-light hover:bg-hover",
            )}
          >
            <span>{activeOption ? activeOption.label : ""}</span>
            <svg className="size-4 fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M12 17l-8-8h16z" />
            </svg>
          </button>

          {/* 仕切り線 */}
          <div className="w-px h-full bg-secondary-light shrink-0" />

          {/* 右側：昇降順トグルボタン部分 */}
          <button
            type="button"
            className="px-3 h-full transition-colors cursor-pointer flex items-center justify-center text-secondary-light hover:text-secondary hover:bg-hover shrink-0 focus-visible:bg-hover focus-visible:text-secondary outline-none"
            onClick={handleOrderToggle}
            title={currentOrder === "asc" ? t("sort-asc") : t("sort-desc")}
            aria-label={currentOrder === "asc" ? t("sort-asc") : t("sort-desc")}
          >
            {currentOrder === "asc" ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
          </button>
        </div>

        {isOpen && (
          <div
            role="listbox"
            className="absolute left-0 z-50 mt-1.5 w-full rounded-xl bg-white py-1.5 shadow-lg text-sm font-semibold animate-in fade-in-0 slide-in-from-top-1 duration-100"
          >
            {options.map(({ label, value }) => {
              const isSelected = value === currentSort;
              return (
                <div
                  key={value}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => handleSortChange(value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSortChange(value);
                    }
                  }}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center justify-between py-2 px-5 hover:bg-hover hover:text-secondary outline-none focus-visible:bg-hover focus-visible:text-secondary transition-colors first:rounded-t-xl last:rounded-b-xl",
                    isSelected ? "text-secondary font-bold" : "text-neutral-800",
                  )}
                >
                  <span>{label}</span>
                  {isSelected && <span className="text-[10px]">✓</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
