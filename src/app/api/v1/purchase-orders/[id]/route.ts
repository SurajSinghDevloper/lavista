import { purchaseOrders } from "@/server/resources/procurement";

export const GET = purchaseOrders.get;
export const PATCH = purchaseOrders.update;
export const DELETE = purchaseOrders.remove;
