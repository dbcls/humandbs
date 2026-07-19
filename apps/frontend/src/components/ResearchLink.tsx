import { Link } from "@tanstack/react-router";

import { FA_ICONS } from "@/lib/faIcons";

import { TextWithIcon } from "./TextWithIcon";

/**
 * Link to a research page, with icon
 */
export function ResearchLink({ humId }: { humId: string }) {
  return (
    <Link to="/{-$lang}/research/$humId" params={{ humId }}>
      <TextWithIcon icon={FA_ICONS.books}>{humId}</TextWithIcon>
    </Link>
  );
}
