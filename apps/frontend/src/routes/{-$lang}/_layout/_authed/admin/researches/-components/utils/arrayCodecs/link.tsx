import { Input } from "@/components/ui/input";

import type { ArrayCodec } from "./types";

function CardField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-400">{label}</span>
      <span className="min-h-[1.25rem] text-xs">
        {value || <span className="text-gray-300">—</span>}
      </span>
    </div>
  );
}

function CardFieldInput({
  label,
  fieldKey,
  fields,
  onChange,
}: {
  label: string;
  fieldKey: string;
  fields: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-400">{label}</span>
      <Input
        value={fields[fieldKey] ?? ""}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        className="h-7 text-xs"
      />
    </div>
  );
}

export const linkCodec: ArrayCodec = {
  blank: () => ({
    fields: { text: "", url: "" },
  }),

  title: (fields) => fields["text"] || fields["url"] || "",

  fromItem: (item) => ({
    fields: {
      text: String(item.text ?? ""),
      url: String(item.url ?? ""),
    },
  }),

  toItem: ({ fields }) => ({
    text: fields["text"] ?? "",
    url: fields["url"] ?? "",
  }),

  ViewCard: ({ item }) => {
    const text = typeof item.text === "string" ? item.text : null;
    const url = typeof item.url === "string" ? item.url : null;
    return (
      <div className="flex flex-col gap-2 rounded border border-gray-300 bg-white p-3">
        <CardField label="Label" value={text} />
        <CardField label="URL" value={url} />
      </div>
    );
  },

  EditBody: ({ card, onChange }) => {
    const f = card.fields;
    return (
      <div className="flex flex-col gap-2 p-3">
        <CardFieldInput label="Label" fieldKey="text" fields={f} onChange={onChange} />
        <CardFieldInput label="URL" fieldKey="url" fields={f} onChange={onChange} />
      </div>
    );
  },
};
