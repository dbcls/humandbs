import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useTranslations } from "use-intl";

import { useEffect, useRef, useState } from "react";

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
  const currentSort =
    sort && options.some((o) => o.value === sort) ? sort : (options[0]?.value ?? "");
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
      <span className="shrink-0 select-none whitespace-nowrap font-semibold text-secondary-light text-xs uppercase tracking-wider">
        {t("sort")}
      </span>
      <div
        className="relative"
        ref={containerRef}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsOpen(false);
          }
        }}
      >
        <div
          className={cn(
            buttonVariants({ variant: "captionAction", size: "captionAction" }),
            "cursor-default select-none overflow-hidden p-0 font-normal transition-colors",
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
              "flex h-full cursor-pointer select-none items-center gap-1.5 border-none bg-transparent pr-2.5 pl-4 font-semibold text-xs outline-none transition-colors focus-visible:bg-hover",
              isOpen
                ? "bg-secondary text-white focus-visible:bg-secondary/90"
                : "text-secondary-light hover:bg-hover",
            )}
          >
            <span>{activeOption ? activeOption.label : ""}</span>
            <svg className="size-4 shrink-0 fill-current" viewBox="0 0 24 24">
              <path d="M12 17l-8-8h16z" />
            </svg>
          </button>

          {/* 仕切り線 */}
          <div className="h-full w-px shrink-0 bg-secondary-light" />

          {/* 右側：昇降順トグルボタン部分 */}
          <button
            type="button"
            className="flex h-full shrink-0 cursor-pointer items-center justify-center px-3 text-secondary-light outline-none transition-colors hover:bg-hover hover:text-secondary focus-visible:bg-hover focus-visible:text-secondary"
            onClick={handleOrderToggle}
            title={currentOrder === "asc" ? t("sort-asc") : t("sort-desc")}
            aria-label={currentOrder === "asc" ? t("sort-asc") : t("sort-desc")}
          >
            {currentOrder === "asc" ? (
              <ArrowUpNarrowWide size={16} />
            ) : (
              <ArrowDownWideNarrow size={16} />
            )}
          </button>
        </div>

        {isOpen && (
          <div
            role="listbox"
            className="fade-in-0 slide-in-from-top-1 absolute left-0 z-50 mt-1.5 w-full animate-in rounded-xl bg-white py-1.5 font-semibold text-sm shadow-lg duration-100"
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
                    "relative flex w-full cursor-pointer select-none items-center justify-between px-5 py-2 outline-none transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-hover hover:text-secondary focus-visible:bg-hover focus-visible:text-secondary",
                    isSelected ? "font-bold text-secondary" : "text-neutral-800",
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
