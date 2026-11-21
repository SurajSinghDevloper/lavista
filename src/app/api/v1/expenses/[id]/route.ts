import { expenses } from "@/server/resources/finance";

export const GET = expenses.get;
export const PATCH = expenses.update;
export const DELETE = expenses.remove;
