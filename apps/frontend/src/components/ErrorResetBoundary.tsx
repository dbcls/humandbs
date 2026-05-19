import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { CatchBoundary } from "@tanstack/react-router";
import { Button } from "./ui/button";
import type { ErrorRouteComponent } from "@tanstack/react-router";

export function ErrorResetBoundary({
  getResetKey,
  children,
  errorComponent,
}: {
  getResetKey: () => string | number;
  children: React.ReactNode;
  errorComponent?: ErrorRouteComponent;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <CatchBoundary
          getResetKey={getResetKey}
          onCatch={reset}
          errorComponent={
            errorComponent ??
            function (props) {
              return (
                <div className="flex-1">
                  <h3>Error</h3>
                  <ErrorContent {...props} />
                </div>
              );
            }
          }
        >
          {children}
        </CatchBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export function ErrorContent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <>
      <p className="text-red-500">
        {"data" in error && typeof error.data === "object"
          ? (error.data as { detail: string } | undefined)?.detail
          : error.message}
      </p>
      <Button variant={"outline"} onClick={reset}>
        Retry
      </Button>
    </>
  );
}
