import type { Status } from "./model";
import { getLatestStatus, insertStatus, getStatusesLimit } from "../db";

export function getStatus(): Status | null {
    return getLatestStatus();
}

export function setStatus(status: Omit<Status, "createdAt">): void {
    var createdStatus = insertStatus(status);
    fetch(process.env.STATUS_UPDATE_DISCORD_WEBHOOK_URL!, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(generateStatusDiscordWebhookMessage(createdStatus))
    });
}

export function getStatuses(limit: number): Status[] {
    return getStatusesLimit(limit);
}

export function generateStatusDiscordWebhookMessage(status: Status): {} {
    const emojiPart = status.emoji ? `${status.emoji} ` : "";
    return {
        embeds: [
            {
                title: "echolotl has updated their status!",
                description: `${emojiPart} ${status.text}`,
                timestamp: new Date(status.createdAt).toISOString(),
                color: 0xf53eb8
            }
        ]
    };
}