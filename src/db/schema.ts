import {
    sqliteTable,
    integer,
    text,
    primaryKey,
} from "drizzle-orm/sqlite-core";

export const contestTable = sqliteTable("contests", {
    contestId: text("contest_id").primaryKey(),
    contestDuration: integer("contest_duration"),
    startTime: integer("start_time", { mode: "timestamp" }),
    title: text("title"),
    problems: text("problems", { mode: "json" }), // [integer ids]
    creatorId: text("creator_id"),
    random: integer("random", { mode: "boolean" }),
    public: integer("public", { mode: "boolean" }),
});

export const participantsTable = sqliteTable(
    "participants",
    {
        participantId: text("participant_id"),
        contestId: text("contest_id"),
        performance: text("performance", { mode: "json" }),
    },
    (table) => [
        primaryKey({ columns: [table.participantId, table.contestId] }),
    ],
);

export const usersTable = sqliteTable("users", {
    userId: text("user_id").primaryKey(),
    username: text("username").notNull(),
    email: text("email").unique().notNull(),
    password: text("password").notNull(),
});

export const submissionsTable = sqliteTable("submissions", {
    submissionId: text("submission_id").primaryKey(),
    contestId: text("contest_id").notNull(),
    problemId: integer("problem_id").notNull(),
    participantId: text("participant_id").notNull(),
    // Array of Judge0 tokens, one per test case
    tokens: text("tokens", { mode: "json" }).$type<string[]>().notNull(),
    // Parallel array to tokens — null means Judge0 hasn't called back yet
    results: text("results", { mode: "json" })
        .$type<(Record<string, unknown> | null)[]>()
        .notNull(),
    verdict: text("verdict").notNull().default("pending"),
    submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull(),
});

export const problemsTable = sqliteTable("problems", {
    problemId: integer("problem_id").primaryKey(),
    title: text("title").notNull(),
    difficulty: text("difficulty", {
        enum: ["easy", "medium", "hard"],
    }).notNull(),
    topics: text("topics", { mode: "json" }).$type<string[]>().notNull(),
    timeLimit: integer("time_limit").notNull().default(2),
    memoryLimit: integer("memory_limit").notNull().default(256),
});
