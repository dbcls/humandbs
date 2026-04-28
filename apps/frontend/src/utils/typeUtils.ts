export type DeepOmit<T, K extends string> = T extends (infer U)[]
  ? DeepOmit<U, K>[]
  : T extends object
    ? {
        [P in keyof T as P extends K ? never : P]: DeepOmit<T[P], K>;
      }
    : T;
