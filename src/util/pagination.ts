export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export function limit(value: number | undefined): number;
export function limit(
  min: number,
  max: number,
  value: number | undefined,
): number;
export function limit(
  minOrValue: number | undefined,
  max?: number,
  value?: number,
): number {
  const min =
    arguments.length === 1 ? DEFAULT_PAGE_SIZE : (minOrValue as number);
  const resolvedMax = arguments.length === 1 ? MAX_PAGE_SIZE : (max as number);
  const resolvedValue = arguments.length === 1 ? minOrValue : value;

  if (resolvedValue === undefined || !Number.isFinite(resolvedValue))
    return min;
  return Math.min(Math.max(resolvedValue, min), resolvedMax);
}

export function paginate<T extends { id: number }>(
  items: T[],
  limit: number,
): { items: T[]; nextCursor: number | null } {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { items: page, nextCursor };
}
