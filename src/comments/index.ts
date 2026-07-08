import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { toPublicUser } from "../auth/discord/service";
import {
  deleteComment,
  editComment,
  getCommentById,
  getCommentsByParentId,
  getCommentsByUserId,
  getTopLevelCommentsBySlug,
  getUserByUserId,
  insertComment,
  userBySession,
} from "../db";
import { limit, paginate } from "../util/pagination";
import {
  notifyCommentEdited,
  notifyNewComment,
  notifyNewReply,
  toCommentNode,
  toCommentNodes,
  toUserComment,
} from "./service";

const commentBodySchema = t.String({ minLength: 1, maxLength: 5000 });

export const commentsRouter = new Elysia({ prefix: "/comments" })
  .use(rateLimit({ duration: 60_000, max: 100, scoping: "scoped" }))
  .get(
    "/user/:userId",
    ({ params, query, set }) => {
      const user = getUserByUserId(params.userId);
      if (!user) {
        set.status = 404;
        return "User not found";
      }

      const pageSize = limit(query.limit);
      const payload = {
        user: toPublicUser(user),
        comments: getCommentsByUserId(params.userId, pageSize).map(
          toUserComment,
        ),
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
      }),
    },
  )
  .get(
    "/s/:slug",
    ({ params, query }) => {
      const pageSize = limit(query.limit);
      const comments = getTopLevelCommentsBySlug(
        params.slug,
        pageSize + 1,
        query.cursor,
      );
      const { items, nextCursor } = paginate(comments, pageSize);

      const payload = {
        slug: params.slug,
        comments: toCommentNodes(items),
        nextCursor,
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
        cursor: t.Optional(t.Number()),
      }),
    },
  )
  .post(
    "/s/:slug",
    async ({ params, cookie: { session }, set, body }) => {
      const user = userBySession(session.value as string | undefined);
      if (!user) {
        set.status = 401;
        return "User not authenticated";
      }

      const comment = insertComment(user.userId, params.slug, null, body);
      await notifyNewComment(comment, user);

      return new Response(JSON.stringify(toCommentNode(comment)), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    },
    {
      body: commentBodySchema,
    },
  )
  .get("/:id", ({ params, set }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      set.status = 400;
      return "Invalid comment id";
    }

    const comment = getCommentById(id);
    if (!comment) {
      set.status = 404;
      return "Comment not found";
    }

    const [node] = toCommentNodes([comment]);

    return new Response(JSON.stringify(node), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
  .get(
    "/:id/replies",
    ({ params, query, set }) => {
      const id = Number(params.id);
      if (!Number.isInteger(id)) {
        set.status = 400;
        return "Invalid comment id";
      }

      const comment = getCommentById(id);
      if (!comment) {
        set.status = 404;
        return "Comment not found";
      }

      const pageSize = limit(query.limit);
      const replies = getCommentsByParentId(id, pageSize + 1, query.cursor);
      const { items, nextCursor } = paginate(replies, pageSize);

      const payload = {
        parentId: id,
        replies: toCommentNodes(items),
        nextCursor,
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
        cursor: t.Optional(t.Number()),
      }),
    },
  )
  .post(
    "/:id",
    async ({ params, cookie: { session }, set, body }) => {
      const user = userBySession(session.value as string | undefined);
      if (!user) {
        set.status = 401;
        return "User not authenticated";
      }

      const id = Number(params.id);
      if (!Number.isInteger(id)) {
        set.status = 400;
        return "Invalid comment id";
      }

      const parent = getCommentById(id);
      if (!parent) {
        set.status = 404;
        return "Parent comment not found";
      }

      const comment = insertComment(user.userId, parent.slug, id, body);
      await notifyNewReply(comment, parent, user);

      return new Response(JSON.stringify(toCommentNode(comment)), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    },
    {
      body: commentBodySchema,
    },
  )
  .patch(
    "/:id",
    async ({ params, cookie: { session }, set, body }) => {
      const user = userBySession(session.value as string | undefined);
      if (!user) {
        set.status = 401;
        return "User not authenticated";
      }

      const id = Number(params.id);
      if (!Number.isInteger(id)) {
        set.status = 400;
        return "Invalid comment id";
      }

      const comment = getCommentById(id);
      if (!comment) {
        set.status = 404;
        return "Comment not found";
      }

      if (comment.userId !== user.userId) {
        set.status = 403;
        return "You can only edit your own comments";
      }

      if (comment.deletedAt) {
        set.status = 410;
        return "Comment has been deleted";
      }

      const updatedComment = editComment(id, body);
      if (!updatedComment) {
        set.status = 404;
        return "Comment not found";
      }

      await notifyCommentEdited(comment, updatedComment, user);

      const [node] = toCommentNodes([updatedComment]);

      return new Response(JSON.stringify(node), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    {
      body: commentBodySchema,
    },
  )
  .delete("/:id", ({ params, cookie: { session }, set }) => {
    const user = userBySession(session.value as string | undefined);
    if (!user) {
      set.status = 401;
      return "User not authenticated";
    }

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      set.status = 400;
      return "Invalid comment id";
    }

    const comment = getCommentById(id);
    if (!comment) {
      set.status = 404;
      return "Comment not found";
    }

    if (comment.userId !== user.userId) {
      set.status = 403;
      return "You can only delete your own comments";
    }

    if (comment.deletedAt) {
      set.status = 204;
      return null;
    }

    deleteComment(id);
    set.status = 204;
    return null;
  });
