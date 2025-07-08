import { createSelectSchema } from "drizzle-zod";
import * as schema from "./schema";

const documentSchema = createSelectSchema(schema.document);
