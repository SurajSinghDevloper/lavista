import { projects } from "@/server/resources/projects";

export const GET = projects.get;
export const PATCH = projects.update;
export const DELETE = projects.remove;
