import express from 'express'
import { usersTable } from '../db/schema';
import jwt from 'jsonwebtoken'
import {randomUUID} from 'crypto'
import { db } from '../index.ts'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
const usersRouter = express.Router();

usersRouter.post('/sign-up', async (req, res) => {
  interface SignUpBody {
    username: string;
    password: string;
    email: string;
  }
  
  const { username, password, email }: SignUpBody = req.body;
  if(!username || !password || !email) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const hashedPassword: string = await bcrypt.hash(password, 10);


  const userID: string = randomUUID();
  try {  
    await db.insert(usersTable).values({
      userId: userID,
      username,
      password: hashedPassword,
      email
    })
  }
  catch (error) {
     return res.status(400).json({ message: 'User already exists' });
  }
  res.status(201).json({ message: 'User created successfully' });
})

usersRouter.post('/sign-in', async (req, res) => {
  interface SignInBody {
    email: string;
    password: string;
  }
  
  const { email, password }: SignInBody = req.body;
  if(!email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const user = await db.select().from(usersTable).where(eq(usersTable.email, email))
  if(!user || user.length === 0) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  const isPasswordValid: boolean = await bcrypt.compare(password, user[0].password);
  if(!isPasswordValid) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  const token: string = jwt.sign({ userId: user[0].userId }, process.env.JWT_SECRET as string);
  res.cookie('token', token, { httpOnly: true, secure: true });
  res.status(200).json({ message: 'User signed in successfully' });
})

export default usersRouter;
