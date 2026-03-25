import { z } from "zod";

export function enumFromStringArray<T extends string>(constants: readonly T[]) {
  return z.enum([constants[0], ...constants.slice(0)]);
}

export function unionOfLiterals<T extends string | number>(
  constants: readonly T[],
) {
  const literals = constants.map((x) => z.literal(x)) as unknown as readonly [
    z.ZodLiteral<T>,
    z.ZodLiteral<T>,
    ...z.ZodLiteral<T>[],
  ];
  return z.union(literals);
}

export function getDefaults<Schema extends z.ZodObject>(schema: Schema) {
  return Object.fromEntries(
    Object.entries(schema.shape).map(([key, value]) => {
      if (value instanceof z.ZodDefault)
        return [key, value._def.defaultValue()];
      return [key, undefined];
    }),
  );
}
