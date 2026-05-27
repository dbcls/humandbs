import { Input } from "@/components/ui/input";

import type { ArrayCodec } from "./types";

function bv(v: unknown): string {
  if (!v) return "";
  if (typeof v === "object" && "text" in v) return (v as { text: string }).text ?? "";
  return String(v);
}

function tv(s: string): { text: string } | null {
  return s.trim() ? { text: s.trim() } : null;
}

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

function URLInputRow({
  label,
  textKey,
  urlKey,
  fields,
  onChange,
}: {
  label: string;
  textKey: string;
  urlKey: string;
  fields: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-400">{label}</span>
      <Input
        value={fields[textKey] ?? ""}
        onChange={(e) => onChange(textKey, e.target.value)}
        className="h-7 rounded-b-none text-xs"
        placeholder="Title"
      />
      <Input
        value={fields[urlKey] ?? ""}
        onChange={(e) => onChange(urlKey, e.target.value)}
        className="h-7 rounded-t-none text-xs"
        placeholder="URL"
      />
    </div>
  );
}

export const projectCodec: ArrayCodec = {
  blank: () => ({
    fields: {
      "name.ja": "",
      "name.en": "",
      "url.ja.text": "",
      "url.ja.url": "",
      "url.en.text": "",
      "url.en.url": "",
    },
  }),

  title: (fields) => fields["name.en"] || fields["name.ja"] || "",

  fromItem: (item) => {
    const url = item.url as
      | { ja?: { text?: string; url?: string } | null; en?: { text?: string; url?: string } | null }
      | null
      | undefined;
    return {
      fields: {
        "name.ja": bv((item.name as { ja?: { text?: string } })?.ja),
        "name.en": bv((item.name as { en?: { text?: string } })?.en),
        "url.ja.text": url?.ja?.text ?? "",
        "url.ja.url": url?.ja?.url ?? "",
        "url.en.text": url?.en?.text ?? "",
        "url.en.url": url?.en?.url ?? "",
      },
    };
  },

  toItem: ({ fields }) => {
    const urlJa = fields["url.ja.url"]
      ? { text: fields["url.ja.text"] ?? "", url: fields["url.ja.url"] }
      : null;
    const urlEn = fields["url.en.url"]
      ? { text: fields["url.en.text"] ?? "", url: fields["url.en.url"] }
      : null;
    return {
      name: { ja: tv(fields["name.ja"] ?? ""), en: tv(fields["name.en"] ?? "") },
      url: urlJa || urlEn ? { ja: urlJa, en: urlEn } : null,
    };
  },

  ViewCard: ({ item }) => {
    const name = item.name as { ja?: { text?: string }; en?: { text?: string } } | undefined;
    const url = item.url as
      | { ja?: { text?: string; url?: string } | null; en?: { text?: string; url?: string } | null }
      | null
      | undefined;
    return (
      <div className="flex flex-col gap-2 rounded border border-gray-300 bg-white p-3">
        <BilingualRow label="Name" en={name?.en?.text} ja={name?.ja?.text} />
        <fieldset className="flex flex-col gap-0.5">
          <span className="text-gray-600 text-xs">URL</span>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1">
              <span className="text-[10px] text-gray-400">En</span>
              <span className="text-gray-500 text-xs">
                {url?.en?.text || <span className="text-gray-300">—</span>}
              </span>
              <span className="break-all text-blue-600 text-xs">
                {url?.en?.url || <span className="text-gray-300">—</span>}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1">
              <span className="text-[10px] text-gray-400">Ja</span>
              <span className="text-gray-500 text-xs">
                {url?.ja?.text || <span className="text-gray-300">—</span>}
              </span>
              <span className="break-all text-blue-600 text-xs">
                {url?.ja?.url || <span className="text-gray-300">—</span>}
              </span>
            </div>
          </div>
        </fieldset>
      </div>
    );
  },

  EditBody: ({ card, onChange }) => {
    const f = card.fields;
    return (
      <div className="flex flex-col gap-3 p-3">
        <BilingualInputRow
          label="Name"
          enKey="name.en"
          jaKey="name.ja"
          fields={f}
          onChange={onChange}
        />
        <fieldset className="flex flex-col gap-1">
          <span className="text-gray-600 text-xs">URL</span>
          <div className="flex gap-2">
            <div className="flex-1">
              <URLInputRow
                label="En"
                textKey="url.en.text"
                urlKey="url.en.url"
                fields={f}
                onChange={onChange}
              />
            </div>
            <div className="flex-1">
              <URLInputRow
                label="Ja"
                textKey="url.ja.text"
                urlKey="url.ja.url"
                fields={f}
                onChange={onChange}
              />
            </div>
          </div>
        </fieldset>
      </div>
    );
  },
};
