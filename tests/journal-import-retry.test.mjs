import test from "node:test";
import assert from "node:assert/strict";
import {mayLinkImportedAssets} from "../lib/campaigns/journal-import-retry.ts";
test("new page is eligible",()=>assert.equal(mayLinkImportedAssets("a.md","a","a",new Set(["a.md"]),false),true));
test("unchanged page is eligible",()=>assert.equal(mayLinkImportedAssets("a.md","a","a",new Set(),false),true));
test("changed page is ineligible",()=>assert.equal(mayLinkImportedAssets("a.md","a","b",new Set(),false),false));
test("pending uploads never bypass GM edits",()=>assert.equal(mayLinkImportedAssets("a.md","a","b",new Set(),true),false));

test("partial import exact match",()=>assert.equal(mayLinkImportedAssets("a.md","original","converted",new Set(),true,"converted"),true));
test("partial import edited mismatch",()=>assert.equal(mayLinkImportedAssets("a.md","original","changed",new Set(),true,"converted"),false));
