import "dotenv/config";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import usersRouter from "./api/users";
import contestRouter from "./api/contest";
import cookieParser from "cookie-parser";

const sqlite = new Database(process.env.DATABASE_URL ?? "sqlite.db");
export const db = drizzle(sqlite);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser())
app.use("/v1/api/users", usersRouter);
app.use("/v1/api/contest", contestRouter);
app.use(express.static(path.join(__dirname, "..", "data", "problems")));

app.listen(process.env.PORT ?? 3000);
