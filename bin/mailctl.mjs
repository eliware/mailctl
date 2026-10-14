#!/usr/bin/env node
import "../src/config.mjs";
import process from "node:process";
import { log, registerHandlers, registerSignals } from "@eliware/common";
import { runCli } from "../src/cli.mjs";

registerHandlers({ log });
registerSignals({ log, exitCode: 1, shutdownHook: async () => {} });

runCli(process.argv.slice(2)).catch((error) => {
  const payload = {
    error: { code: error.code ?? "MAILCTL_ERROR", message: error.message },
    ...(error.requestId ? { request_id: error.requestId } : {}),
  };
  console.error(JSON.stringify(payload));
  process.exitCode = 1;
});
