import { getReplyCounts, getUserByUserId } from "../db";
import { getAvatarUrl, toPublicUser } from "../auth/discord/service";
import { type User } from "../auth/discord/model";
import { Logger } from "../util/logger";
import { sendDiscordWebhook } from "../util/webhook";
import { FRONTEND_URL } from "../constants";
import type { Comment, CommentNode, UserComment } from "./model";

const commentsLogger = Logger.fmtPackage("COMMENTS");

export function toCommentNode(comment: Comment, replyCount = 0): CommentNode {
  const user = getUserByUserId(comment.userId);

  return {
    id: comment.id,
    slug: comment.slug,
    parentId: comment.parentId,
    body: comment.deletedAt ? "[deleted]" : comment.body,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    deletedAt: comment.deletedAt,
    author: user ? toPublicUser(user) : null,
    replyCount,
  };
}

export function toCommentNodes(comments: Comment[]): CommentNode[] {
  const counts = getReplyCounts(comments.map((comment) => comment.id));
  return comments.map((comment) =>
    toCommentNode(comment, counts.get(comment.id) ?? 0),
  );
}

export function toUserComment(comment: Comment): UserComment {
  return {
    id: comment.id,
    slug: comment.slug,
    parentId: comment.parentId,
    body: comment.deletedAt ? "[deleted]" : comment.body,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    deletedAt: comment.deletedAt,
  };
}

export async function notifyNewComment(
  comment: Comment,
  author: User,
): Promise<void> {
  try {
    await sendDiscordWebhook({
      content: `New comment on "[${comment.slug}](${FRONTEND_URL}/art/${comment.slug})"`,
      embeds: [
        {
          description: comment.body,
          timestamp: new Date(comment.createdAt).toISOString(),
          color: 0x00ff00,
          author: {
            name: author.username,
            icon_url: getAvatarUrl(author) ?? undefined,
          },
        },
      ],
    });
  } catch (error) {
    Logger.warning(
      `${commentsLogger}Failed to send comment webhook: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function notifyNewReply(
  reply: Comment,
  parent: Comment,
  author: User,
): Promise<void> {
  const parentAuthor = getUserByUserId(parent.userId);

  try {
    await sendDiscordWebhook({
      content: `New reply on "[${parent.slug}](${FRONTEND_URL}/art/${parent.slug})"`,
      embeds: [
        {
          description: parent.body,
          author: {
            name: parentAuthor?.username ?? "Unknown",
            icon_url: (parentAuthor && getAvatarUrl(parentAuthor)) ?? undefined,
          },
        },
        {
          description: reply.body,
          timestamp: new Date(reply.createdAt).toISOString(),
          color: 0x00ff00,
          author: {
            name: author.username,
            icon_url: getAvatarUrl(author) ?? undefined,
          },
        },
      ],
    });
  } catch (error) {
    Logger.warning(
      `${commentsLogger}Failed to send reply webhook: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function notifyCommentEdited(
  original: Comment,
  updated: Comment,
  author: User,
): Promise<void> {
  try {
    await sendDiscordWebhook({
      content: `Comment edited on "[${original.slug}](${FRONTEND_URL}/art/${original.slug})"`,
      embeds: [
        {
          title: "original",
          description: original.body,
        },
        {
          description: updated.body,
          timestamp: new Date(updated.editedAt ?? Date.now()).toISOString(),
          color: 0x0000ff,
          author: {
            name: author.username,
            icon_url: getAvatarUrl(author) ?? undefined,
          },
        },
      ],
    });
  } catch (error) {
    Logger.warning(
      `${commentsLogger}Failed to send edit webhook: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
