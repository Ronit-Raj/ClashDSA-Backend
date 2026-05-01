# Clash-DSA-backend

This is the backend for a platform that allows users to create coding 
contest and compete with others. The main development is being done on a 
remote machine. 

## Types of contests 
1. Random: 
In a random contest creator can also participate.To create the contest the creator will choose the number of question and topics/difficulty.The system will gather the questions and create the contest.
2. Curated:
Future plan the creator can curate problems from an existing set 

## Tech stack 
1. Express
2. drizzle
3. sqlite
4. typescript 
5. zod

## Problem creation 
You would also be required to write problem statements and their test cases. To generate the test cases use a python script. The problem statements have to be written in html. That HTML would be rendered using an iframe on the front end.
Do not use any emojis in the statement
- Statements are stored in data/problems/{id}/statement.html
- tests are store in data/problem/{id}
- the list of problem is stored in the database

problem table
- id:number
- tags:json array 
- difficulty:number(out of 3. To signify easy medium hard)

## Sandboxing
The project uses Judge0 for code sandboxing. This server and judge0 both are working on the same machine.
We will use the Judge0 webhooks to notify this server when judge0 has finished executing. 