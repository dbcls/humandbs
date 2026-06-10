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
    cancelLabel?: React.ReactNode;
    actionLabel: React.ReactNode;
    onAction: () => void;
    onCancel?: () => void;
  }) => void;
  closeConfirmation: () => void;
}

const closedState = {
  open: false,
  title: null,
  description: null,
  cancelLabel: null,
  actionLabel: null,
  onAction: () => {},
  onCancel: () => {},
};

const useConfirmationStore = create<ConfirmationState & ConfirmationActions>((set) => ({
  ...closedState,
  openConfirmation: (data) => {
    set({
      open: true,
      title: data.title,
      description: data.description,
      cancelLabel: data.cancelLabel ?? "Cancel",
      actionLabel: data.actionLabel,
      onAction: () => {
        data.onAction();
        set(closedState);
      },
      onCancel: () => {
        data.onCancel?.();
        set(closedState);
      },
    });
  },
  closeConfirmation: () => {
    set(closedState);
  },
}));

export default useConfirmationStore;
