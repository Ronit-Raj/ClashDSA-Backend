import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../index.ts";
import { submissionsTable } from "../db/schema.ts";
import { io } from "../index.ts";


const hookRouter = express.Router();

// Judge0 status id 3 === "Accepted"
const ACCEPTED_STATUS_ID = 3;

hookRouter.put("/submissionHook", async (req, res) => {
    // Acknowledge immediately so Judge0 doesn't retry
    res.sendStatus(200);

    const payload = req.body as {
        token: string;
        status: { id: number; description: string };
        time: string | null;
        memory: number | null;
        stdout: string | null;
        stderr: string | null;
        compile_output: string | null;
    };

    const { token } = payload;

    if (!token) {
        console.error("[Hook] Received webhook payload with no token");
        return;
    }

    try {
        // Find the submission that owns this token.
        // Tokens are stored as a JSON array string, e.g. '["abc","def"]'.
        // LIKE '%token%' is safe here because Judge0 tokens are UUIDs
        // (no SQL wildcard characters).
        const submission = await db
          .select()
          .from(submissionsTable)
          .where(
            sql`${submissionsTable.tokens} ? ${token}`
          )
          .limit(1);

        if (!submission) {
            console.error(`[Hook] No submission found for token: ${token}`);
            return;
        }
        // console.log(payload)
        io.to(submission[0].submissionId).emit("codeResult", payload);
        const idx = submission[0].tokens.indexOf(token);
        if (idx === -1) {
            // Shouldn't happen if the LIKE matched, but guard anyway
            console.error(
                `[Hook] Token ${token} not found in submission ${submission[0].submissionId}`,
            );
            return;
        }

        // Slot this test case result into the parallel results array
        const updatedResults = [
            ...(submission[0].results as (Record<string, unknown> | null)[]),
        ];
        updatedResults[idx] = {
            token,
            status: payload.status,
            time: payload.time,
            memory: payload.memory,
            stdout: payload.stdout,
            stderr: payload.stderr,
            compile_output: payload.compile_output,
        };

        const allDone = updatedResults.every((r) => r !== null);


    } catch (error) {
        console.error("[Hook] Error processing webhook:", error);
    }
});

export default hookRouter;
