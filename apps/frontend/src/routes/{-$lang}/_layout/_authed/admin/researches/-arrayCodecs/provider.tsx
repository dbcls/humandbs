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

export const providerCodec: ArrayCodec = {
  blank: () => ({
    fields: {
      "name.ja": "",
      "name.en": "",
      email: "",
      orcid: "",
      "org.ja": "",
      "org.en": "",
      "org.country": "",
    },
  }),

  title: (fields) => fields["name.en"] || fields["name.ja"] || "",

  fromItem: (item) => {
    const org = item.organization as
      | {
          name?: { ja?: { text?: string }; en?: { text?: string } };
          address?: { country?: string | null } | null;
        }
      | null
      | undefined;
    return {
      fields: {
        "name.ja": bv((item.name as { ja?: { text?: string } })?.ja),
        "name.en": bv((item.name as { en?: { text?: string } })?.en),
        email: String(item.email ?? ""),
        orcid: String(item.orcid ?? ""),
        "org.ja": bv(org?.name?.ja),
        "org.en": bv(org?.name?.en),
        "org.country": org?.address?.country ?? "",
      },
    };
  },

  toItem: ({ fields }) => {
    const hasOrg = fields["org.ja"] || fields["org.en"] || fields["org.country"];
    return {
      name: { ja: tv(fields["name.ja"] ?? ""), en: tv(fields["name.en"] ?? "") },
      email: fields["email"] || null,
      orcid: fields["orcid"] || null,
      organization: hasOrg
        ? {
            name: { ja: tv(fields["org.ja"] ?? ""), en: tv(fields["org.en"] ?? "") },
            address: fields["org.country"] ? { country: fields["org.country"] } : null,
          }
        : null,
    };
  },

  ViewCard: ({ item }) => {
    const name = item.name as { ja?: { text?: string }; en?: { text?: string } } | undefined;
    const email = typeof item.email === "string" ? item.email : null;
    const orcid = typeof item.orcid === "string" ? item.orcid : null;
    const org = item.organization as
      | {
          name?: { ja?: { text?: string }; en?: { text?: string } };
          address?: { country?: string | null } | null;
        }
      | null
      | undefined;
    return (
      <div className="flex flex-col gap-2 rounded border border-gray-300 bg-white p-3">
        <BilingualRow label="Name" en={name?.en?.text} ja={name?.ja?.text} />
        <div className="flex gap-2">
          <div className="flex-1">
            <CardField label="Email" value={email} />
          </div>
          <div className="flex-1">
            <CardField label="ORCID" value={orcid} />
          </div>
        </div>
        <fieldset className="flex flex-col gap-1.5 rounded border border-gray-300 p-2">
          <span className="font-medium text-gray-600 text-xs">Organization</span>
          <BilingualRow label="Name" en={org?.name?.en?.text} ja={org?.name?.ja?.text} />
          <CardField label="Country" value={org?.address?.country} />
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
        <div className="flex gap-2">
          <div className="flex-1">
            <CardFieldInput label="Email" fieldKey="email" fields={f} onChange={onChange} />
          </div>
          <div className="flex-1">
            <CardFieldInput label="ORCID" fieldKey="orcid" fields={f} onChange={onChange} />
          </div>
        </div>
        <fieldset className="flex flex-col gap-2 rounded border border-gray-300 p-3">
          <span className="font-medium text-gray-600 text-xs">Organization</span>
          <BilingualInputRow
            label="Name"
            enKey="org.en"
            jaKey="org.ja"
            fields={f}
            onChange={onChange}
          />
          <CardFieldInput label="Country" fieldKey="org.country" fields={f} onChange={onChange} />
        </fieldset>
      </div>
    );
  },
};
