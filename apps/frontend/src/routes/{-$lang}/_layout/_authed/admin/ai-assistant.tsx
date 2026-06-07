import { createFileRoute } from "@tanstack/react-router";

import { AssistantLegacyPage } from "./-assistant-legacy/assistant-legacy-page";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/ai-assistant")({
  component: AssistantLegacyPage,
});
