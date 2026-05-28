import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import usersRouter from "./api/users.js";
import contestRouter from "./api/contest.js";
import hookRouter from "./api/hook.js";
import { Server } from "socket.io";
import http from "http";

export const db = drizzle(process.env.DATABASE_URL!);
if (!db) {
    console.log("Failed to connect to database");
}

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

const server = http.createServer(app);
const options = {
    cors: {
        origin: FRONTEND_ORIGIN,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
    },
};
export const io = new Server(server, options);
io.on("connection", (socket) => {
    socket.on("joinRoom", (submissionId) => {
        // console.log(`Socket ${socket.id} joined room ${submissionId}`);
        socket.join(submissionId);
    });
});
server.listen(process.env.PORT ?? 3000, () => {
    console.log(
        `Server running on port ${process.env.PORT ?? 3000} — CORS origin: ${FRONTEND_ORIGIN}`,
    );
});
