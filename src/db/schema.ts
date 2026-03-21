import {uuid,pgTable,integer, varchar, boolean,timestamp,json} from 'drizzle-orm/pg-core';

export const contestTable = pgTable('contests', {
  contestId: uuid('contest_id').primaryKey(),
  contestDuration: integer('contest_duration'),
  startTime: timestamp('start_time'),
  title: varchar('title'),
  problems: json('problems'),
  creatorId: uuid('creator_id'),
  random: boolean('random'),
  public: boolean('public'),
})

export const participantsTable = pgTable('participants', {
  participantId: uuid('participant_id').primaryKey(),
  contestId: uuid('contest_id'),
  performance: json('performance'),
})

export const usersTable = pgTable('users', {
  userId: uuid('user_id').primaryKey(),
  username: varchar('username'),
  email: varchar('email'),
  password: varchar('password'),
})
