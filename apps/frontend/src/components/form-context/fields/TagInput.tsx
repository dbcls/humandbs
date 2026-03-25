import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  placeholder?: string;
}

export function TagInput({
  value,
  onChange,
  label,
  placeholder = "Type and press comma or Enter",
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
    <div className="flex flex-col gap-1">
      {label && <Label className="text-sm">{label}</Label>}
      <div className="flex flex-wrap items-center gap-1 rounded border px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
        {value.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="size-3" />
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
          className="min-w-[80px] flex-1 border-0 p-0 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
