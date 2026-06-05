type Scope = "dataset" | "research";
const activeSearchControllers = new Map<Scope, AbortController>();

export function nextSearchSignal(scope: Scope) {
  activeSearchControllers.get(scope)?.abort();

  const controller = new AbortController();
  activeSearchControllers.set(scope, controller);

  return controller.signal;
}

export function clearSearchSignal(scope: Scope, signal: AbortSignal) {
  const controller = activeSearchControllers.get(scope);
  if (controller?.signal === signal) {
    activeSearchControllers.delete(scope);
  }
}
