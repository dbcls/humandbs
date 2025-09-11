import { createServerFn } from "@tanstack/react-start";

const $getResearchList = createServerFn({ method: "GET" }).handler(
  async (ctx) => {}
);
