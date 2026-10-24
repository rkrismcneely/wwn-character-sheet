import test from "node:test";
import assert from "node:assert/strict";
import {mayLinkImportedAssets} from "../lib/campaigns/journal-import-retry.ts";
test("new page is eligible",()=>assert.equal(mayLinkImportedAssets("a.md","a","a",new Set(["a.md"]),false),true));
test("unchanged page is eligible",()=>assert.equal(mayLinkImportedAssets("a.md","a","a",new Set(),false),true));
test("changed page is ineligible",()=>assert.equal(mayLinkImportedAssets("a.md","a","b",new Set(),false),false));
test("pending uploads are eligible",()=>assert.equal(mayLinkImportedAssets("a.md","a","b",new Set(),true),true));
