import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});
export const pgPool2 = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  database: process.env.PG_DATABASE2,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});
