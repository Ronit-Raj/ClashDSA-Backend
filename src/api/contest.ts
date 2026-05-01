import express from "express";
import {
    contestTable,
    participantsTable,
    problemsTable,
    submissionsTable,
} from "../db/schema.ts";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../index.ts";
import { z } from "zod";
import { eq } from "drizzle-orm";
import requireSignIn from "../middlewares/requireSignIn.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolved once at startup: ClashDSA-Backend/data/
const DATA_DIR = path.join(__dirname, "..", "..", "data");

// Judge0 runs inside Docker; it cannot reach "localhost" on the host.
// Set CALLBACK_HOST to the Docker bridge gateway (172.17.0.1 on Linux)
// or any IP reachable from inside the Judge0 container.
const CALLBACK_HOST = process.env.CALLBACK_HOST ?? "localhost";
const SERVER_PORT = process.env.PORT ?? "3000";
const CALLBACK_BASE = `http://${CALLBACK_HOST}:${SERVER_PORT}`;

const contestRouter = express.Router();

contestRouter.use(express.json());

contestRouter.get("/getPublicContests", async (req, res) => {
    const publicContests = await db
        .select()
        .from(contestTable)
        .where(eq(contestTable.public, true));
    res.json(publicContests);
});

const createContestSchema = z.object({
    contestId: z.string().uuid(),
    title: z.string().min(3).max(100),
    duration: z.number().min(1), // duration in minutes
    startTime: z.string().datetime(),
    noOfProblems: z.number().min(1).max(10),
    public: z.boolean(),
});

contestRouter.post("/create", requireSignIn, async (req, res) => {
    const result = createContestSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(result.error);
    }

    const {
        contestId,
        title,
        duration,
        startTime,
        noOfProblems,
        public: isPublic,
    } = result.data;

    try {
        // Fetch all problems from the database
        const allProblems = await db.select().from(problemsTable);

        // Check if we have enough problems
        if (allProblems.length < noOfProblems) {
            return res.status(400).json({
                message: `Not enough problems available. Requested: ${noOfProblems}, Available: ${allProblems.length}`,
            });
        }

        // Randomly select problems
        const selectedProblemsIds: number[] = [];
        const usedIndices = new Set<number>();

        while (selectedProblemsIds.length < noOfProblems) {
            const randomIndex = Math.floor(Math.random() * allProblems.length);
            if (!usedIndices.has(randomIndex)) {
                usedIndices.add(randomIndex);
                selectedProblemsIds.push(allProblems[randomIndex].problemId);
            }
        }

        const inserted = await db
            .insert(contestTable)
            .values({
                contestId,
                title,
                contestDuration: duration,
                startTime: new Date(startTime),
                creatorId: (req.user as any).userId,
                problems: selectedProblemsIds,
                random: true,
                public: isPublic,
            })
            .onConflictDoNothing();

        // If nothing was inserted, a contest with this ID already exists
        if (inserted.changes === 0) {
            return res.status(200).json({
                message: "Contest already exists",
            });
        }

        res.status(201).json({
            message: "Contest created successfully",
            contestId,
        });
    } catch (error) {
        console.error("Error creating contest:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

const enterContestSchema = z.object({
    contestId: z.string().uuid(),
});

contestRouter.post("/enter", requireSignIn, async (req, res) => {
    const result = enterContestSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(result.error);
    }

    const { contestId } = result.data;
    const participantId = (req.user as any).userId;

    try {
        // Verify the contest exists
        const contest = await db
            .select()
            .from(contestTable)
            .where(eq(contestTable.contestId, contestId))
            .get();

        if (!contest) {
            return res.status(404).json({ message: "Contest not found" });
        }

        const inserted = await db
            .insert(participantsTable)
            .values({
                participantId,
                contestId,
                performance: [],
            })
            .onConflictDoNothing();

        if (inserted.changes === 0) {
            return res.status(200).json({ message: "Already entered contest" });
        }

        res.status(201).json({
            message: "Entered contest successfully",
            contestId,
        });
    } catch (error) {
        console.error("Error entering contest:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

const submitSchema = z.object({
    contestId: z.string().uuid(),
    problemId: z.number(),
    sourceCode: z.string(),
    language: z.number(),
});

contestRouter.post("/submit", requireSignIn, async (req, res) => {
    const result = submitSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(result.error);
    }

    const { contestId, problemId, sourceCode, language } = result.data;
    const participantId = (req.user as any).userId;

    try {
        // Fetch the problem details (time/memory limits) from DB
        const problemDetails = await db
            .select()
            .from(problemsTable)
            .where(eq(problemsTable.problemId, problemId))
            .get();

        if (!problemDetails) {
            return res.status(404).json({ message: "Problem not found" });
        }

        let { timeLimit, memoryLimit } = problemDetails;
        memoryLimit *= 1024; //db stores memory limit in MB

        // Discover all test case files for this problem, e.g. "1_1.txt", "1_2.txt"
        const testDir = path.join(DATA_DIR, "test");
        const stdoutDir = path.join(DATA_DIR, "stdout");
        const prefix = `${problemId}_`;

        const allFiles = await readdir(testDir);
        const testFiles = allFiles
            .filter((f) => f.startsWith(prefix) && f.endsWith(".txt"))
            // Sort numerically by test ID so test 2 comes before test 10
            .sort((a, b) => {
                const idA = parseInt(a.slice(prefix.length, -4), 10);
                const idB = parseInt(b.slice(prefix.length, -4), 10);
                return idA - idB;
            });

        if (testFiles.length === 0) {
            return res
                .status(400)
                .json({ message: "No test data available for this problem" });
        }

        // Read every stdin / expected-output pair in parallel
        const testCases = await Promise.all(
            testFiles.map(async (fileName) => ({
                stdin: await readFile(path.join(testDir, fileName), "utf-8"),
                expected_output: await readFile(
                    path.join(stdoutDir, fileName),
                    "utf-8",
                ),
            })),
        );

        // Build one batch payload — same source code, different stdin per test case
        const batchPayload = {
            submissions: testCases.map((tc) => ({
                source_code: sourceCode,
                language_id: language,
                stdin: tc.stdin,
                expected_output: tc.expected_output,
                cpu_time_limit: timeLimit,
                memory_limit: memoryLimit,
                enable_network: false,
                callback_url: `${CALLBACK_BASE}/v1/api/submissionHook`,
            })),
        };

        // Single HTTP call to Judge0 — returns one token per test case
        const judge0Resp = await fetch(
            "http://localhost:2358/submissions/batch",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(batchPayload),
            },
        );

        if (!judge0Resp.ok) {
            const errText = await judge0Resp.text();
            console.error("Judge0 batch error:", errText);
            return res
                .status(502)
                .json({ message: "Failed to submit to judge" });
        }

        const tokenList = (await judge0Resp.json()) as { token?: string }[];
        const tokens = tokenList
            .filter((t): t is { token: string } => Boolean(t.token))
            .map((t) => t.token);

        if (tokens.length === 0) {
            return res
                .status(502)
                .json({ message: "Judge0 returned no valid tokens" });
        }

        // Persist the submission so the webhook can correlate tokens back to it
        const submissionId = crypto.randomUUID();
        await db.insert(submissionsTable).values({
            submissionId,
            contestId,
            problemId,
            participantId,
            tokens,
            results: new Array(tokens.length).fill(null),
            verdict: "pending",
            submittedAt: new Date(),
        });

        console.log(
            `[Submit] submissionId=${submissionId} ` +
                `problemId=${problemId} testCases=${tokens.length}`,
        );

        return res.status(202).json({
            message: "Submission accepted",
            submissionId,
            totalTestCases: tokens.length,
        });
    } catch (error) {
        console.error("Error submitting solution:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});
export default contestRouter;
