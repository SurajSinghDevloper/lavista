import { checklists } from "@/server/resources/site";

export const GET = checklists.get;
export const PATCH = checklists.update;
export const DELETE = checklists.remove;
