export function removeById<Item extends { id: string }>(items: Item[], id: string): Item[] {
  return items.filter((item) => item.id !== id);
}

export function upsertById<Item extends { id: string }>(items: Item[], item: Item): Item[] {
  return [item, ...removeById(items, item.id)];
}
