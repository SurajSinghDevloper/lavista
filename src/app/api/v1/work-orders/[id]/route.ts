import { workOrders } from "@/server/resources/site";

export const GET = workOrders.get;
export const PATCH = workOrders.update;
export const DELETE = workOrders.remove;
