import "dotenv/config";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import usersRouter from "./api/users";
import contestRouter from "./api/contest";
import hookRouter from "./api/hook.ts";

const sqlite = new Database(process.env.DATABASE_URL ?? "sqlite.db");
export const db = drizzle(sqlite);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS must be registered before every other middleware and router.
// credentials: true is required for the httpOnly auth cookie to be sent
// cross-origin. The wildcard origin "*" is not allowed when credentials
// are enabled — the exact frontend origin must be specified.
// Set FRONTEND_ORIGIN in .env, e.g.:  FRONTEND_ORIGIN=http://192.168.1.5:5173
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
app.use(
    cors({
        origin: FRONTEND_ORIGIN,
        credentials: true, // allow the auth cookie to travel cross-origin
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type"],
    }),
);

app.use(express.json());
app.use(cookieParser());
app.use("/v1/api/", hookRouter);
app.use("/v1/api/users", usersRouter);
app.use("/v1/api/contest", contestRouter);
app.use(express.static(path.join(__dirname, "..", "data", "problems")));

app.listen(process.env.PORT ?? 3000, () => {
    console.log(
        `Server running on port ${process.env.PORT ?? 3000} — CORS origin: ${FRONTEND_ORIGIN}`,
    );
});
