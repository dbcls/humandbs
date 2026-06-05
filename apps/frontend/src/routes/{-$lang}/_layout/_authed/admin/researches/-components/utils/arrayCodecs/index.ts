import { grantCodec } from "./grant";
import { linkCodec } from "./link";
import { projectCodec } from "./project";
import { providerCodec } from "./provider";
import { publicationCodec } from "./publication";
import type { ArrayCodec, ArrayDataType } from "./types";

/**
 * Array codecs - things that help to render data from API (`ResearchDoc`) and convert
 */
export const arrayCodecs: Record<ArrayDataType, ArrayCodec> = {
  providers: providerCodec,
  projects: projectCodec,
  grants: grantCodec,
  publications: publicationCodec,
  links: linkCodec,
};

export type { ArrayCodec, ArrayDataType, ArrayItem, EditableCard } from "./types";
