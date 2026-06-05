import { Input } from "@/components/ui/input";

import type { ArrayCodec } from "./types";

function BilingualRow({
  label,
  en,
  ja,
}: {
  label: string;
  en?: string | null;
  ja?: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-0.5">
      <span className="text-gray-600 text-xs">{label}</span>
      <div className="flex gap-2">
        <div className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1">
          <span className="block text-[10px] text-gray-400">En</span>
          <span className="text-xs">{en || <span className="text-gray-300">—</span>}</span>
        </div>
        <div className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1">
          <span className="block text-[10px] text-gray-400">Ja</span>
          <span className="text-xs">{ja || <span className="text-gray-300">—</span>}</span>
        </div>
      </div>
    </fieldset>
  );
}

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

function BilingualInputRow({
  label,
  enKey,
  jaKey,
  fields,
  onChange,
}: {
  label: string;
  enKey: string;
  jaKey: string;
  fields: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <span className="text-gray-600 text-xs">{label}</span>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[10px] text-gray-400">En</span>
          <Input
            value={fields[enKey] ?? ""}
            onChange={(e) => onChange(enKey, e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[10px] text-gray-400">Ja</span>
          <Input
            value={fields[jaKey] ?? ""}
            onChange={(e) => onChange(jaKey, e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>
    </fieldset>
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

export const publicationCodec: ArrayCodec = {
  blank: () => ({
    fields: { "title.ja": "", "title.en": "", doi: "" },
  }),

  title: (fields) => fields["title.en"] || fields["title.ja"] || "",

  fromItem: (item) => {
    const title = item.title as { ja?: string; en?: string } | undefined;
    return {
      fields: {
        "title.ja": title?.ja ?? "",
        "title.en": title?.en ?? "",
        doi: String(item.doi ?? ""),
      },
    };
  },

  toItem: ({ fields }) => ({
    title: { ja: fields["title.ja"] ?? null, en: fields["title.en"] ?? null },
    doi: fields["doi"] || null,
  }),

  ViewCard: ({ item }) => {
    const title = item.title as { ja?: string | null; en?: string | null } | undefined;
    const doi = typeof item.doi === "string" ? item.doi : null;
    return (
      <div className="flex flex-col gap-2 rounded border border-gray-300 bg-white p-3">
        <BilingualRow label="Title" en={title?.en} ja={title?.ja} />
        <CardField label="DOI" value={doi} />
      </div>
    );
  },

  EditBody: ({ card, onChange }) => {
    const f = card.fields;
    return (
      <div className="flex flex-col gap-3 p-3">
        <BilingualInputRow
          label="Title"
          enKey="title.en"
          jaKey="title.ja"
          fields={f}
          onChange={onChange}
        />
        <CardFieldInput label="DOI" fieldKey="doi" fields={f} onChange={onChange} />
      </div>
    );
  },
};
