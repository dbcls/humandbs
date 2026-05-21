import { SearchIcon, XIcon } from "lucide-react";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";

/**
 * Debounced search input with search icon and clear button.
 * Uses the rounded "search" Input variant.
 */
export function FilterSearchInput({
  value,
  onChange,
  className,
  placeholder = "Search…",
  debounceMs = 400,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  className?: string;
  placeholder?: string;
  debounceMs?: number;
}) {
  const [inputValue, setInputValue] = useState(value ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    // While the field is focused, keep local typing authoritative so
    // debounced parent updates don't briefly overwrite newer keystrokes.
    if (!isFocusedRef.current) {
      setInputValue(value ?? "");
    }
  }, [value]);

  function commit(val: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(val.trim() || undefined);
    }, debounceMs);
  }

  function handleClear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setInputValue("");
    onChange(undefined);
  }

  return (
    <Input
      type="text"
      placeholder={placeholder}
      value={inputValue}
      className={className}
      beforeIcon={<SearchIcon size={14} className="text-muted-foreground" />}
      afterIcon={
        inputValue ? (
          <Button
            variant="plain"
            size="icon"
            className="pointer-events-auto p-0 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
          >
            <XIcon size={14} />
          </Button>
        ) : null
      }
      onChange={(e) => {
        setInputValue(e.target.value);
        commit(e.target.value);
      }}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onBlur={() => {
        isFocusedRef.current = false;
        setInputValue(value ?? "");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (timerRef.current) clearTimeout(timerRef.current);
          onChange(inputValue.trim() || undefined);
        }
      }}
    />
  );
}
