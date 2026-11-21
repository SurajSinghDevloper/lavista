import { attendance } from "@/server/resources/work";

export const GET = attendance.get;
export const PATCH = attendance.update;
export const DELETE = attendance.remove;
