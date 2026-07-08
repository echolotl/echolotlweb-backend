import type { PublicUser } from "../auth/discord/model";

export interface Comment {
  id: number;
  userId: string;
  slug: string;
  parentId: number | null;
  body: string;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
}

export type CommentNode = {
  id: number;
  slug: string;
  parentId: number | null;
  body: string;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
  author: PublicUser | null;
  replyCount: number;
};

export type UserComment = Omit<CommentNode, "author" | "replyCount">;
