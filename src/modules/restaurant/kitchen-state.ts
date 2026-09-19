export type KitchenJobItemStatus = "QUEUED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";

const transitions: Record<KitchenJobItemStatus, readonly KitchenJobItemStatus[]> = {
  QUEUED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: []
};

export function canTransitionKitchenJobItem(from: KitchenJobItemStatus, to: KitchenJobItemStatus): boolean {
  return transitions[from].includes(to);
}
