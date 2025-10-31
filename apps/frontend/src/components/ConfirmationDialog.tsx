import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import useConfirmationStore from "@/stores/confirmationStore";

/**
 * A confirmation dialog that can be triggered from anywhere in the app.
 * Use `useConfirmationStore` hook for that.
 */
function ConfirmationDialog() {
  const { open, title, description, cancelLabel, actionLabel, onAction } =
    useConfirmationStore();

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="bg-primary">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onAction}>
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmationDialog;
