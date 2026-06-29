import { useEffect, useRef, useState } from "react";

/**
 * A custom hook to dynamically calculate the maximum height of a table container
 * to ensure it fits perfectly within the remaining space of the viewport.
 * This prevents the browser window from scrolling vertically when possible,
 * which keeps the vertical sticky table header sticking to the top of the container.
 *
 * @param bottomReservedSpace The space reserved below the table wrapper (e.g. for pagination, card padding, etc.)
 */
export function useMaxHeight(bottomReservedSpace = 130) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>("calc(100vh - 16rem)");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const rect = el.getBoundingClientRect();
      const topOffset = rect.top;

      // Calculate available height: viewport height minus top offset minus space reserved at the bottom
      const calculated = window.innerHeight - topOffset - bottomReservedSpace;

      // Set to calculated height, with a safe fallback minimum of 200px
      setMaxHeight(`${Math.max(calculated, 200)}px`);
    };

    // Calculate on initial mount
    updateHeight();

    // Recalculate on window resize
    window.addEventListener("resize", updateHeight);

    // Also watch for any DOM mutations or layout shifts in the parent container
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateHeight);
    });
    if (el.parentElement) {
      observer.observe(el.parentElement);
    }

    return () => {
      window.removeEventListener("resize", updateHeight);
      observer.disconnect();
    };
  }, [bottomReservedSpace]);

  return { containerRef, maxHeight };
}
