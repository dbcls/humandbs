import { FA_ICONS } from "@/lib/faIcons";

import { Link } from "./Link";
import { TextWithIcon } from "./TextWithIcon";

/**
 * Link to a dataset with icon
 */
export function DatasetLink({ datasetId, className }: { datasetId: string; className?: string }) {
  return (
    <Link className={className} to="/{-$lang}/dataset/$datasetId" params={{ datasetId }}>
      <TextWithIcon icon={FA_ICONS.dataset}>{datasetId}</TextWithIcon>
    </Link>
  );
}
