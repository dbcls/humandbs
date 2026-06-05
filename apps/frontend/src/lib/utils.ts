import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// disabled-text-field applies bg-gray-50, border, border-gray-200, rounded, p-3, text-sm.
// Registering it in each affected group so twMerge treats it as conflicting with those utilities.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "bg-color": ["disabled-text-field"],
      "border-color": ["disabled-text-field"],
      "border-w": ["disabled-text-field"],
      "text-color": ["disabled-text-field"],
      rounded: ["disabled-text-field"],
      p: ["disabled-text-field"],
      "font-size": ["disabled-text-field"],
    },
  },
});
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
