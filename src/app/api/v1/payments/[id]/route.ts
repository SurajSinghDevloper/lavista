import { payments } from "@/server/resources/finance";

export const GET = payments.get;
export const PATCH = payments.update;
export const DELETE = payments.remove;
