import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultEnvPath = path.resolve(currentDir, "../../../.env");

dotenv.config({ path: process.env.SB_ENV_FILE || defaultEnvPath });
