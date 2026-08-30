#!/usr/bin/env node
import "./src/config.mjs";
import process from "node:process";
import packageJson from "./package.json" with { type: "json" };
import { log, registerHandlers, registerSignals } from "@eliware/common";
import { parseArgs } from "./src/args.mjs";
import { help } from "./src/help.mjs";
import { runApiCommand } from "./src/api-commands.mjs";

registerHandlers({ log });
registerSignals({ log, exitCode: 1, shutdownHook: async () => {} });

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  if (options.version) return console.log(JSON.stringify({ version: packageJson.version }));
  if (positionals[0] === "help") return console.log(JSON.stringify({ help: help(positionals.slice(1)) }));
  if (!positionals.length || options.help)
    return console.log(JSON.stringify({ help: help(positionals) }));
  const [command, ...ids] = positionals;
  return await runApiCommand(command, ids, options);
}

main().catch((error) => {
  const payload = {
    error: { code: error.code ?? "MAILCTL_ERROR", message: error.message },
    ...(error.requestId ? { request_id: error.requestId } : {}),
  };
  console.error(JSON.stringify(payload));
  process.exitCode = 1;
});
