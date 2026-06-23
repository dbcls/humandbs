export type FieldKind =
  | { kind: "enum"; options: string[] }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "string" }
  | { kind: "array"; itemKind: FieldKind }
  | { kind: "object"; shape: Record<string, FieldKind> }
  | { kind: "unknown" };

export function getFieldKind(schema: { _def: any }): FieldKind {
  const type: string = schema._def?.type ?? "";

  if (type === "nullable" || type === "optional") {
    return getFieldKind(schema._def.innerType);
  }

  if (type === "number") return { kind: "number" };
  if (type === "boolean") return { kind: "boolean" };
  if (type === "string") return { kind: "string" };

  if (type === "enum") {
    const options: string[] = schema._def.entries
      ? Object.values(schema._def.entries as Record<string, string>)
      : ((schema as any).options ?? []);
    return { kind: "enum", options };
  }

  if (type === "array") {
    return { kind: "array", itemKind: getFieldKind(schema._def.element) };
  }

  if (type === "object") {
    const shape: Record<string, FieldKind> = {};
    for (const [key, value] of Object.entries(schema._def.shape as Record<string, { _def: any }>)) {
      shape[key] = getFieldKind(value);
    }
    return { kind: "object", shape };
  }

  return { kind: "unknown" };
}
