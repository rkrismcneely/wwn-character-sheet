#!/usr/bin/env node
// Fail-safe test impact selection. Run all tests when dependency analysis is uncertain.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const base = process.env.BASE_SHA;
const full = (reason) => { console.log("mode=full");console.log("reason="+reason); };
if (process.env.GITHUB_EVENT_NAME !== "pull_request" || !/^[a-f0-9]{40}$/i.test(base||"")) { full("non-PR or unknown base");process.exit(0); }
let changed;
try { changed=execFileSync("git",["diff","--name-only",base,"HEAD"],{encoding:"utf8"}).trim().split("\n").filter(Boolean); }
catch {full("git diff unavailable");process.exit(0);}
if (!changed.length) {full("no changed files");process.exit(0);}
// Any executable, configuration, library, auth, test, or workflow change gets all tests.
// Presentation-only source changes are tested by determining imports into the tests.
if (changed.some(f => !(/^(app|components)\/.*\.(tsx|jsx|css)$/.test(f) || /^public\//.test(f) || /\.md$/.test(f)))) {full("high-impact or unknown files");process.exit(0);}
if (changed.some(f=> /\.(tsx|jsx)$/.test(f))) {full("component behavior may affect shared consumers");process.exit(0);}
// CSS and static assets have no executable dependencies; retain mandatory build, typecheck, lint,
// and worker smoke tests but skip expensive unrelated source tests.
console.log("mode=appearance");
console.log("reason=styles and static assets only");
