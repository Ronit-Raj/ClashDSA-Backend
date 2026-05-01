import express from "express";
import { like, eq } from "drizzle-orm";
import { db } from "../index.ts";
import { submissionsTable } from "../db/schema.ts";

const hookRouter = express.Router();

// Judge0 status id 3 === "Accepted"
const ACCEPTED_STATUS_ID = 3;

hookRouter.put("/submissionHook", async (req, res) => {
    // Acknowledge immediately so Judge0 doesn't retry
    console.log("[Hook] Received webhook payload");
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
            .where(like(submissionsTable.tokens, `%${token}%`))
            .get();

        if (!submission) {
            console.error(`[Hook] No submission found for token: ${token}`);
            return;
        }

        const idx = submission.tokens.indexOf(token);
        if (idx === -1) {
            // Shouldn't happen if the LIKE matched, but guard anyway
            console.error(
                `[Hook] Token ${token} not found in submission ${submission.submissionId}`,
            );
            return;
        }

        // Slot this test case result into the parallel results array
        const updatedResults = [
            ...(submission.results as (Record<string, unknown> | null)[]),
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

        // Compute verdict only once every test case has reported back
        let verdict = "pending";
        if (allDone) {
            const firstFailure = updatedResults.find(
                (r) =>
                    (r as Record<string, unknown> & { status: { id: number } })
                        .status.id !== ACCEPTED_STATUS_ID,
            );
            verdict = firstFailure
                ? (
                      firstFailure as Record<string, unknown> & {
                          status: { description: string };
                      }
                  ).status.description
                : "Accepted";
        }

        await db
            .update(submissionsTable)
            .set({ results: updatedResults, verdict })
            .where(eq(submissionsTable.submissionId, submission.submissionId));

        if (allDone) {
            const total = updatedResults.length;
            const passed = updatedResults.filter(
                (r) =>
                    (r as Record<string, unknown> & { status: { id: number } })
                        .status.id === ACCEPTED_STATUS_ID,
            ).length;

            console.log(
                `\n=== Submission ${submission.submissionId} complete ===`,
            );
            console.log(
                `Problem: ${submission.problemId} | Verdict: ${verdict} | Passed: ${passed}/${total}`,
            );
            console.log("Per-test results:");
            updatedResults.forEach((r, i) => {
                const result = r as Record<string, unknown> & {
                    status: { id: number; description: string };
                    time: string | null;
                    memory: number | null;
                };
                const icon =
                    result.status.id === ACCEPTED_STATUS_ID ? "OK" : "FAIL";
                console.log(
                    `  [${String(i + 1).padStart(2, " ")}/${total}] ${icon}` +
                        ` | ${result.status.description.padEnd(20)}` +
                        ` | time: ${result.time ?? "-"}s` +
                        ` | mem: ${result.memory ?? "-"}KB`,
                );
            });
            console.log("=".repeat(50));
        }
    } catch (error) {
        console.error("[Hook] Error processing webhook:", error);
    }
});

export default hookRouter;
