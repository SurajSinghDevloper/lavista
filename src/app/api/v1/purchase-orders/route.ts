import { purchaseOrders } from "@/server/resources/procurement";

export const GET = purchaseOrders.list;
export const POST = purchaseOrders.create;
