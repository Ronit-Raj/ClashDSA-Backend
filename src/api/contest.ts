import express from "express";
import {
    contestTable,
    participantsTable,
    problemsTable,
} from "../db/schema.ts";
import { db } from "../index.ts";
import { z } from "zod";
import { eq } from "drizzle-orm";
import requireSignIn from "../middlewares/requireSignIn.ts";

const contestRouter = express.Router();

contestRouter.use(express.json());

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

export default contestRouter;
