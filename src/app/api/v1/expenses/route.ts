import { expenses } from "@/server/resources/finance";

export const GET = expenses.list;
export const POST = expenses.create;
