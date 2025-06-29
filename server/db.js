import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Client } = pkg;

const db = new Client({
    const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Required by Render
    },
});
db.connect();

export default db;
