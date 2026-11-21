import { invoices } from "@/server/resources/finance";

export const GET = invoices.get;
export const PATCH = invoices.update;
export const DELETE = invoices.remove;
