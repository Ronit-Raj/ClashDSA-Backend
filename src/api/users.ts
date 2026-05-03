import express from "express";
import { usersTable } from "../db/schema";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "../index.ts";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import requireSignIn from "../middlewares/requireSignIn.ts";
import type { JwtPayload } from "jsonwebtoken";

const usersRouter = express.Router();

const signUpSchema = z.object({
    username: z
        .string()
        .min(3, "Username must be at least 3 characters")
        .max(32, "Username must be at most 32 characters"),
    email: z.email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

const signInSchema = z.object({
    email: z.email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

usersRouter.use(express.json());

usersRouter.post("/sign-up", async (req, res) => {
    const result = signUpSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({
            message: "Validation failed",
            errors: result.error.flatten().fieldErrors,
        });
    }

    const { username, email, password } = result.data;
    const hashedPassword: string = await bcrypt.hash(password, 10);
    const userId: string = randomUUID();

    try {
        await db
            .insert(usersTable)
            .values({ userId, username, email, password: hashedPassword });
    } catch {
        return res.status(409).json({ message: "User already exists" });
    }

    res.status(201).json({ message: "User created successfully" });
});

usersRouter.post("/sign-in", async (req, res) => {
    const result = signInSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({
            message: "Validation failed",
            errors: result.error.flatten().fieldErrors,
        });
    }

    const { email, password } = result.data;

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, result.data.email));
    if (users.length === 0) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordValid: boolean = await bcrypt.compare(
        password,
        users[0].password!,
    );
    if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const token: string = jwt.sign(
        { userId: users[0].userId },
        process.env.JWT_SECRET as string,
    );
    res.cookie("token", token, { httpOnly: true, secure: false });
    res.status(200).json({ message: "User signed in successfully" });
});

usersRouter.get("/me", requireSignIn, async (req, res) => {
    const userId = (req.user as JwtPayload).userId as string;

    const user = await db
        .select({
            userId: usersTable.userId,
            username: usersTable.username,
            email: usersTable.email,
        })
        .from(usersTable)
        .where(eq(usersTable.userId, userId))
        .limit(1)
      
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(user[0]);
});

export default usersRouter;
