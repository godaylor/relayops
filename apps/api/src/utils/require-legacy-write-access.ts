import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

export async function assertLegacyWriteAccess(workspaceId: string) {
  const [workspace] = await db
    .select({ productMode: schema.workspaceTable.productMode })
    .from(schema.workspaceTable)
    .where(eq(schema.workspaceTable.id, workspaceId))
    .limit(1);
  if (!workspace)
    throw new HTTPException(404, { message: "Workspace not found" });
  if (workspace.productMode === "relayops") {
    throw new HTTPException(409, {
      message:
        "Legacy Project and Task data is read-only after RelayOps activation",
    });
  }
}

export async function requireLegacyWriteAccess(c: Context, next: Next) {
  const workspaceId = c.get("workspaceId");
  if (!workspaceId) {
    throw new HTTPException(500, {
      message: "workspaceId not set in context",
    });
  }
  await assertLegacyWriteAccess(workspaceId);
  return next();
}
