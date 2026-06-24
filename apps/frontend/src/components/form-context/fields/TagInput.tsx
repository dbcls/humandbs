import { X } from "lucide-react";

import type { KeyboardEvent } from "react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  tagClassName?: string;
  isModified?: boolean;
}

export function TagInput({
  value,
  onChange,
  label,
  placeholder = "Type and press comma or Enter",
  className,
  inputClassName,
  tagClassName,
  isModified,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInputValue("");
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <Label className="text-sm">{label}</Label>}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 rounded focus-within:ring-1 focus-within:ring-ring",
          {
            "px-2 py-1.5": !!label,
          },
        )}
      >
        {value.map((tag, i) => (
          <span
            key={tag}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full bg-form-tag-bg px-2 py-0.5 text-xs",
              {
                "border border-form-modified-text bg-form-modified-bg text-form-modified-text":
                  isModified,
              },
              tagClassName,
            )}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="text-form-icon-btn hover:text-form-icon-btn-hover"
            >
              <X className="size-4" />
            </button>
          </span>
        ))}
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) addTag(inputValue);
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className={cn(
            "min-w-[80px] flex-1 border-0 px-2 py-1.5 text-xs shadow-none focus-visible:ring-0",
            {
              "bg-form-modified-bg": isModified,
            },
            inputClassName,
          )}
        />
      </div>
    </div>
  );
}
