import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const contestTable = sqliteTable("contests", {
    contestId: text("contest_id").primaryKey(),
    contestDuration: integer("contest_duration"),
    startTime: integer("start_time", { mode: "timestamp" }),
    title: text("title"),
    problems: text("problems", { mode: "json" }),
    creatorId: text("creator_id"),
    random: integer("random", { mode: "boolean" }),
    public: integer("public", { mode: "boolean" }),
});

export const participantsTable = sqliteTable("participants", {
    participantId: text("participant_id").primaryKey(),
    contestId: text("contest_id"),
    performance: text("performance", { mode: "json" }),
});

export const usersTable = sqliteTable("users", {
    userId: text("user_id").primaryKey(),
    username: text("username").notNull(),
    email: text("email").unique().notNull(),
    password: text("password").notNull(),
});
