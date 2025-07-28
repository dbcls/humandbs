import { create } from "zustand";

interface ConfirmationState {
  open: boolean;
  title: string | null;
  description: React.ReactNode | null | undefined;
  cancelLabel: React.ReactNode | null;
  actionLabel: React.ReactNode | null;
  onAction: () => void;
  onCancel: () => void;
}

interface ConfirmationActions {
  openConfirmation: (data: {
    title: string;
    description?: React.ReactNode;
    cancelLabel: React.ReactNode;
    actionLabel: React.ReactNode;
    onAction: () => void;
    onCancel: () => void;
  }) => void;
  closeConfirmation: () => void;
}

const useConfirmationStore = create<ConfirmationState & ConfirmationActions>(
  (set) => ({
    open: false,
    title: null,
    description: null,
    cancelLabel: null,
    actionLabel: null,
    onAction: () => {},
    onCancel: () => {},
    openConfirmation: (data) =>
      set((state) => ({
        open: true,
        title: data.title,
        description: data.description,
        cancelLabel: data.cancelLabel,
        actionLabel: data.actionLabel,
        onAction: data.onAction,
        onCancel: data.onCancel,
      })),
    closeConfirmation: () => {
      set((state) => ({
        open: false,
        title: null,
        description: null,
        cancelLabel: null,
        actionLabel: null,
        onAction: () => {},
        onCancel: () => {},
      }));
    },
  })
);

export default useConfirmationStore;
