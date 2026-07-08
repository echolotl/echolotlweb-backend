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
    ({ params, query }) => {
      const user = getUserByUserId(params.userId);
      if (!user) {
        return new Response("User not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
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
    async ({ params, cookie: { session }, body }) => {
      const user = userBySession(session.value as string | undefined);
      if (!user) {
        return new Response("User not authenticated", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        });
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
  .get("/:id", ({ params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return new Response("Invalid comment id", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const comment = getCommentById(id);
    if (!comment) {
      return new Response("Comment not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const [node] = toCommentNodes([comment]);

    return new Response(JSON.stringify(node), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
  .get(
    "/:id/replies",
    ({ params, query }) => {
      const id = Number(params.id);
      if (!Number.isInteger(id)) {
        return new Response("Invalid comment id", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      const comment = getCommentById(id);
      if (!comment) {
        return new Response("Comment not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
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
    async ({ params, cookie: { session }, body }) => {
      const user = userBySession(session.value as string | undefined);
      if (!user) {
        return new Response("User not authenticated", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        });
      }

      const id = Number(params.id);
      if (!Number.isInteger(id)) {
        return new Response("Invalid comment id", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      const parent = getCommentById(id);
      if (!parent) {
        return new Response("Parent comment not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
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
    async ({ params, cookie: { session }, body }) => {
      const user = userBySession(session.value as string | undefined);
      if (!user) {
        return new Response("User not authenticated", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        });
      }

      const id = Number(params.id);
      if (!Number.isInteger(id)) {
        return new Response("Invalid comment id", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      const comment = getCommentById(id);
      if (!comment) {
        return new Response("Comment not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
      }

      if (comment.userId !== user.userId) {
        return new Response("You can only edit your own comments", {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        });
      }

      if (comment.deletedAt) {
        return new Response("Comment has been deleted", {
          status: 410,
          headers: { "Content-Type": "text/plain" },
        });
      }

      const updatedComment = editComment(id, body);
      if (!updatedComment) {
        return new Response("Comment not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
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
  .delete("/:id", ({ params, cookie: { session } }) => {
    const user = userBySession(session.value as string | undefined);
    if (!user) {
      return new Response("User not authenticated", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      return new Response("Invalid comment id", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const comment = getCommentById(id);
    if (!comment) {
      return new Response("Comment not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (comment.userId !== user.userId) {
      return new Response("You can only delete your own comments", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (comment.deletedAt) {
      return new Response(null, { status: 204 });
    }

    deleteComment(id);
    return new Response(null, { status: 204 });
  });
