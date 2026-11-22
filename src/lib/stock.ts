import { AdminDBState, OrderItem, StockMovementItem } from '../types/models';
import { formatTimestamp } from './dates';

function getOrderCostumeSelections(order: OrderItem) {
  if (order.costumes && order.costumes.length > 0) {
    return order.costumes;
  }
  return [
    {
      id: order.costumeId,
      name: order.costumeName,
      price: order.totalPrice,
      days: order.duration,
      size: 'All Size',
    },
  ];
}

export function adjustStockForOrder(
  adminDb: AdminDBState,
  order: OrderItem,
  options: {
    delta: 1 | -1;
    reason: StockMovementItem['reason'];
    note: string;
    actorName: string;
  }
): void {
  const selections = getOrderCostumeSelections(order);
  if (!adminDb.stockMovements) adminDb.stockMovements = [];

  for (const sel of selections) {
    const costume = adminDb.masterCostumes.find((c) => c.id === sel.id);
    if (!costume) continue;
    if (options.delta < 0 && costume.stock <= 0) continue;

    costume.stock = Math.max(0, costume.stock + options.delta);
    adminDb.stockMovements.unshift({
      id: `sm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      costumeId: costume.id,
      costumeName: costume.name,
      size: sel.size || 'All Size',
      delta: options.delta,
      stockAfter: costume.stock,
      reason: options.reason,
      note: options.note,
      actorName: options.actorName,
      orderId: order.id,
      createdAt: formatTimestamp(),
    });
  }
}
