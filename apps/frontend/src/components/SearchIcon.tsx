import type { SVGProps } from "react";

export function SearchIcon({
  size = 16,
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <circle cx="10" cy="10" r="6" />
      <line x1="20.5" y1="20.5" x2="14.24" y2="14.24" />
    </svg>
  );
}

