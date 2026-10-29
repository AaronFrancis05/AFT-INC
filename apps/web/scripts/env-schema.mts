// Prints the web app's env-schema.json to stdout (spec 0010, AC-11): every variable's name
// and metadata, never a value. The deploy (spec 0007) checks Parameter Store against it.
// Runs on plain Node 24 type stripping, so it and everything it imports stay erasable.
import { toEnvSchemaJson } from "@aft/config/env";
import { webEnv } from "../env.ts";

process.stdout.write(`${JSON.stringify(toEnvSchemaJson(webEnv), null, 2)}\n`);
