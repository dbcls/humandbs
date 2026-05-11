import { useState } from "react";

export function useTogglePanel() {
  const [open, setOpen] = useState(true);

  const [renderContent, setRenderContent] = useState(open);

  function togglePanel() {
    setOpen((prev) => !prev);
  }

  function handleTransitionEnd() {
    if (open) {
      setRenderContent(true);
    } else {
      setRenderContent(false);
    }
  }

  return {
    open,
    renderContent,
    togglePanel,
    handleTransitionEnd,
  };
}
