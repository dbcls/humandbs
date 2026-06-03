import { TagInput } from "@/components/form-context/fields/TagInput";
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

export const grantCodec: ArrayCodec = {
  blank: () => ({
    fields: { "title.ja": "", "title.en": "", "agency.ja": "", "agency.en": "" },
    grantIds: [],
  }),

  title: (fields) => fields["title.en"] || fields["title.ja"] || "",

  fromItem: (item) => {
    const title = item.title as { ja?: string; en?: string } | undefined;
    return {
      fields: {
        "title.ja": title?.ja ?? "",
        "title.en": title?.en ?? "",
        "agency.ja": (item.agency as { name?: { ja?: string } })?.name?.ja ?? "",
        "agency.en": (item.agency as { name?: { en?: string } })?.name?.en ?? "",
      },
      grantIds: (item.id as string[] | undefined) ?? [],
    };
  },

  toItem: ({ fields, grantIds }) => ({
    id: grantIds ?? [],
    title: { ja: fields["title.ja"] ?? null, en: fields["title.en"] ?? null },
    agency: { name: { ja: fields["agency.ja"] ?? null, en: fields["agency.en"] ?? null } },
  }),

  ViewCard: ({ item }) => {
    const ids = (item.id as string[] | undefined) ?? [];
    const title = item.title as { ja?: string | null; en?: string | null } | undefined;
    const agency = item.agency as { name?: { ja?: string | null; en?: string | null } } | undefined;
    return (
      <div className="flex flex-col gap-2 rounded border border-gray-300 bg-white p-3">
        <BilingualRow label="Title" en={title?.en} ja={title?.ja} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-400">IDs</span>
          {ids.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {ids.map((id) => (
                <span key={id} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700 text-xs">
                  {id}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </div>
        <fieldset className="flex flex-col gap-1.5 rounded border border-gray-300 p-2">
          <span className="font-medium text-gray-600 text-xs">Agency</span>
          <BilingualRow label="Name" en={agency?.name?.en} ja={agency?.name?.ja} />
        </fieldset>
      </div>
    );
  },

  EditBody: ({ card, onChange, onChangeCard }) => {
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
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-400">IDs</span>
          <TagInput
            value={card.grantIds ?? []}
            onChange={(ids) => onChangeCard({ ...card, grantIds: ids })}
            placeholder="Type and press comma or Enter"
          />
        </div>
        <fieldset className="flex flex-col gap-2 rounded border border-gray-300 p-3">
          <span className="font-medium text-gray-600 text-xs">Agency</span>
          <BilingualInputRow
            label="Name"
            enKey="agency.en"
            jaKey="agency.ja"
            fields={f}
            onChange={onChange}
          />
        </fieldset>
      </div>
    );
  },
};
