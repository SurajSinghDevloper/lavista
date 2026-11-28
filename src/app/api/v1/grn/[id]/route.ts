import { deleteGrn, grns } from "@/server/resources/procurement";

export const GET = grns.get;
export const PATCH = grns.update; // header details only (bill no., amount, vehicle, date, notes, photos)
export const DELETE = deleteGrn;
