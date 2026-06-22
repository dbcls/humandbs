import { createFileRoute } from "@tanstack/react-router";

import { AssistantPage } from "./-assistant/assistant-page";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/ai-assistant")({
  component: AssistantPage,
});
