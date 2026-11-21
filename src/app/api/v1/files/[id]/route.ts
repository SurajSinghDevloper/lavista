import { deleteFile, fileMeta, updateFile } from "@/server/resources/system";

export const GET = fileMeta;
export const PATCH = updateFile;
export const DELETE = deleteFile;
