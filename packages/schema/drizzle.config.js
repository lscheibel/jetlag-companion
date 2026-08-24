import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
dotenv.config({ path: "../../apps/server/.env" });
export default defineConfig({
    schema: "./src/drizzle/index.ts",
    out: "./src/migrations",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL ?? "",
    },
});
