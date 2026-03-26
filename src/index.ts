import "dotenv/config";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import express from "express";
import usersRouter from "./api/users";


const sqlite = new Database(process.env.DATABASE_URL ?? "sqlite.db");
export const db = drizzle(sqlite);

const app = express();
app.use(express.json());
app.use("/v1/api/users", usersRouter);

app.listen(process.env.PORT ?? 3000);
