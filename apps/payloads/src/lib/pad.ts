export const pad2 = (n: number): string => String(n).padStart(2, '0');
export const pad3 = (n: number): string => String(n).padStart(3, '0');

export const pluralise = (n: number, one: string, many: string = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
