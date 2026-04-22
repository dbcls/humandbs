import { createIsomorphicFn } from "@tanstack/react-start";

export const $getLocationOrigin = createIsomorphicFn().client(
  () => window.location.origin,
);
