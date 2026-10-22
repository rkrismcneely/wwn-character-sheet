import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  artEffortCommitmentCount,
  artEffortTotal,
} from "../app/phase2-rules.ts";

test("Art Effort counts migrate legacy booleans and preserve numeric commitments", () => {
  assert.equal(artEffortCommitmentCount(false), 0);
  assert.equal(artEffortCommitmentCount(true), 1);
  assert.equal(artEffortCommitmentCount(0), 0);
  assert.equal(artEffortCommitmentCount(1), 1);
  assert.equal(artEffortCommitmentCount(3), 3);
  assert.equal(artEffortCommitmentCount(-2), 0);
  assert.equal(artEffortCommitmentCount(2.9), 2);
  assert.equal(artEffortCommitmentCount("2"), 2);
  assert.equal(artEffortCommitmentCount("bad"), 0);
});

test("Art Effort totals count multiple commitments to one Art", () => {
  assert.equal(artEffortTotal([1, 2, 0]), 3);
  assert.equal(
    artEffortTotal([true, 2, false]),
    3,
    "a legacy Open Mind checkbox plus two Unthinkable Thought commitments uses three Effort",
  );
});

test("character sheet uses counted Art Effort instead of a checkbox", async () => {
  const sheet = await readFile(
    new URL("../app/character-sheet.tsx", import.meta.url),
    "utf8",
  );

  assert.match(sheet, /artEffort: \[0, 0, 0, 0\] as number\[\]/u);
  assert.match(
    sheet,
    /artEffortCommitmentCount\(incoming\.artEffort\?\.\[index\]\)/u,
  );
  assert.match(sheet, /total \+ artEffortCommitmentCount\(sheet\.artEffort\[index\]\)/u);
  assert.match(sheet, /className="art-effort-commit"/u);
  assert.match(sheet, />Commit<\/button>/u);
  assert.match(sheet, /className="art-effort-count"/u);
  assert.match(sheet, />×\{effortCount\}<\/span>/u);
  assert.match(sheet, /className="art-effort-release"/u);
  assert.match(sheet, />Release<\/button>/u);
  assert.doesNotMatch(
    sheet,
    /type="checkbox" checked=\{Boolean\(sheet\.artEffort\[i\]\)\}/u,
  );
  assert.match(sheet, /const effort = artEffortTotal\(recoverableArtEffort\)/u);
  assert.match(sheet, /artEffort: current\.artPicks\.map\(\(name, index\) =>/u);
});

test("Art commitment controls obey the tradition pool and keep release available", async () => {
  const sheet = await readFile(
    new URL("../app/character-sheet.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    sheet,
    /const canCommit = Boolean\(name\) && !blockedByArmor && Boolean\(pool\) && \(pool\?\.used \?\? 0\) < \(pool\?\.max \?\? 0\)/u,
  );
  assert.match(
    sheet,
    /j === i \? effortCount \+ 1 : artEffortCommitmentCount/u,
  );
  assert.match(
    sheet,
    /j === i \? Math\.max\(0, effortCount - 1\) : artEffortCommitmentCount/u,
  );
  assert.match(sheet, /disabled=\{effortCount <= 0\}/u);
});

test("changing or resizing Arts cannot transfer stale commitment counts", async () => {
  const sheet = await readFile(
    new URL("../app/character-sheet.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    sheet,
    /artEffort: current\.artEffort\.map\(\(count, j\) => j === i \? 0 : artEffortCommitmentCount\(count\)\)/u,
  );
  assert.ok(sheet.includes("reconcileArtEffortBySlot(current.artPicks, current.artEffort, nextArts)"));
});


test("Art Effort Commit and Release are visually button-styled controls", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.art-effort-control button\{[\s\S]*border:1px solid #8e6b35;[\s\S]*background:linear-gradient\(#fff7e4,#e9d2a6\);[\s\S]*cursor:pointer;/u,
  );
  assert.match(
    css,
    /\.art-effort-control \.art-effort-commit\{[\s\S]*background:linear-gradient\(#b9863e,#8e5f21\);[\s\S]*color:#fff8e8;/u,
  );
  assert.match(css, /\.art-effort-control button:hover:not\(:disabled\)/u);
  assert.match(css, /\.art-effort-control button:focus-visible/u);
  assert.match(css, /\.art-effort-control button:disabled/u);
});
