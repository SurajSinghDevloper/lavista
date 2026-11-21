import { dailyReports } from "@/server/resources/site";

export const GET = dailyReports.get;
export const PATCH = dailyReports.update;
export const DELETE = dailyReports.remove;
