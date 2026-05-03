import { 
    pgTable, text, integer, timestamp, boolean, jsonb, primaryKey, pgEnum 
} from "drizzle-orm/pg-core";

// 1. Define Enums (Postgres native feature)
export const difficultyEnum = pgEnum("difficulty", ["easy", "medium", "hard"]);

// 2. Contests Table
export const contestTable = pgTable("contests", {
    contestId: text("contest_id").primaryKey(),
    contestDuration: integer("contest_duration"),
    // Using withTimezone: true ensures absolute consistency between India and East Asia
    startTime: timestamp("start_time", { withTimezone: true }), 
    title: text("title"),
    problems: jsonb("problems").$type<number[]>(), // Stored as native JSONB
    creatorId: text("creator_id"),
    random: boolean("random").default(false),
    public: boolean("public").default(true),
});

// 3. Users Table
export const usersTable = pgTable("users", {
    userId: text("user_id").primaryKey(),
    username: text("username").notNull(),
    email: text("email").unique().notNull(),
    password: text("password").notNull(),
});

// 4. Participants Table
export const participantsTable = pgTable(
    "participants",
    {
        participantId: text("participant_id"),
        contestId: text("contest_id"),
        performance: jsonb("performance").$type<Record<number, string>[]>(), 
    },
    (table) => ({
        pk: primaryKey({ columns: [table.participantId, table.contestId] }),
    }),
);

// 5. Submissions Table
export const submissionsTable = pgTable("submissions", {
    submissionId: text("submission_id").primaryKey(),
    contestId: text("contest_id").notNull(),
    problemId: integer("problem_id").notNull(),
    participantId: text("participant_id").notNull(),
    tokens: jsonb("tokens").$type<string[]>().notNull(),
    results: jsonb("results").$type<(Record<string, unknown> | null)[]>().notNull(),
    verdict: text("verdict").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

// 6. Problems Table
export const problemsTable = pgTable("problems", {
    problemId: integer("problem_id").primaryKey(),
    title: text("title").notNull(),
    difficulty: difficultyEnum("difficulty").notNull(),
    topics: jsonb("topics").$type<string[]>().notNull(),
    timeLimit: integer("time_limit").notNull().default(2),
    memoryLimit: integer("memory_limit").notNull().default(256),
});