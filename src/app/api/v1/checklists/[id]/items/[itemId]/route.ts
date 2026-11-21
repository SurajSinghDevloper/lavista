import { removeChecklistItem, toggleChecklistItem } from "@/server/resources/site";

export const PATCH = toggleChecklistItem;
export const DELETE = removeChecklistItem;
