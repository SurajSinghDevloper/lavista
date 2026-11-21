import { invoices } from "@/server/resources/finance";

export const GET = invoices.list;
export const POST = invoices.create;
