export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export function assertNever(value: never): never {
  throw new Error(`Estado no soportado: ${String(value)}`);
}
