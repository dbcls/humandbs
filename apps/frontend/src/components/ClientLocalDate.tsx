import { ClientOnly } from "@tanstack/react-router";

import { toDateString } from "@/utils/dates";

export function ClientLocalDate({ date }: { date: Date | string }) {
  return (
    <ClientOnly fallback={<span className="inline-block w-20" aria-hidden="true" />}>
      <LocalDate date={date} />
    </ClientOnly>
  );
}

function LocalDate({ date }: { date: Date | string }) {
  return toDateString(date);
}
