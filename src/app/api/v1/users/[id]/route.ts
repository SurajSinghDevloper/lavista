import { deactivateUser, users } from "@/server/resources/users";

export const GET = users.get;
export const PATCH = users.update;
export const DELETE = deactivateUser;
