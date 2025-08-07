import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function enumFromStringArray<T extends string>(constants: readonly T[]) {
  return z.enum([constants[0], ...constants.slice(0)]);
}

export function unionOfLiterals<T extends string | number>(
  constants: readonly T[]
) {
  const literals = constants.map((x) => z.literal(x)) as unknown as readonly [
    z.ZodLiteral<T>,
    z.ZodLiteral<T>,
    ...z.ZodLiteral<T>[],
  ];
  return z.union(literals);
}
