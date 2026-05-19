import { useState } from "react";

export function useTogglePanel() {
  const [open, setOpen] = useState(true);

  const [renderContent, setRenderContent] = useState(open);

  function togglePanel() {
    setOpen((prev) => !prev);
  }

  function handleTransitionEnd() {
    // Open transition end - do nothing (already render=true)
    // Close transition end - hide content (set render=false)
    if (!open) {
      setRenderContent(false);
    }
  }

  function handleTransitionStart() {
    // if opened, before transition first show content, and then transition
    if (open) {
      setRenderContent(true);
    }
    // on close, dont do anything
  }

  return {
    open,
    renderContent,
    togglePanel,
    handleTransitionEnd,
    handleTransitionStart,
  };
}
