import type { FieldDataType } from "../-computeMergeFields";

export type ArrayItem = Record<string, unknown>;
export type EditableCard = { fields: Record<string, string>; grantIds?: string[] };

export interface ArrayCodec {
  blank: () => EditableCard;
  title: (fields: Record<string, string>) => string;
  fromItem: (item: ArrayItem) => EditableCard;
  toItem: (card: EditableCard) => ArrayItem;
  ViewCard: React.FC<{ item: ArrayItem }>;
  EditBody: React.FC<{
    card: EditableCard;
    onChange: (key: string, val: string) => void;
    onChangeCard: (card: EditableCard) => void;
  }>;
}

export type ArrayDataType = Exclude<FieldDataType, "scalar">;
