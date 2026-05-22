import type { DatasetDoc as ServerDatasetDoc } from "@humandbs/backend/types";

import type { StripIndexSignature } from "@/utils/typeUtils";

export type DatasetDoc = StripIndexSignature<ServerDatasetDoc>;
