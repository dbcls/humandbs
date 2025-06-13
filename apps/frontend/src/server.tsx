// src/server.tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import "@/lib/i18n";

import { createRouter } from "./router";

export default createStartHandler({
  createRouter,
})(defaultStreamHandler);
