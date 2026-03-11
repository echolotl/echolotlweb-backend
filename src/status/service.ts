import type { Status } from "./model";
import { getLatestStatus, insertStatus, getStatusesLimit } from "../db";

export function getStatus(): Status | null {
    return getLatestStatus();
}

export function setStatus(status: Omit<Status, "createdAt">): void {
    insertStatus(status);
}

export function getStatuses(limit: number): Status[] {
    return getStatusesLimit(limit);
}