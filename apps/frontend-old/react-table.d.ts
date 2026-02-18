import "@tanstack/react-table";
import { Translator } from "node_modules/use-intl/dist/types/core/createTranslator";
import type { Messages } from "use-intl";

declare module "@tanstack/react-table" {
  interface TableMeta {
    t?: Translator<typeof Messages, keyof Messages>;
    getT?: <TM extends keyof Messages>(
      t: Translator<Messages, TM>
    ) => Translator<typeof Messages, TM>;
  }
}
