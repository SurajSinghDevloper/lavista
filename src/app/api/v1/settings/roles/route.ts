import { listRoles, putRoles, resetRolesToDefault } from "@/server/resources/system";

export const GET = listRoles;
export const PUT = putRoles;
export const DELETE = resetRolesToDefault;
