// Local-only component fixture. No production API, OAuth secrets, or user data.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const server = await createServer({
  configFile: false,
  appType: "custom",
  plugins: [react()],
  define: { "process.env": "{}" },
  root: process.cwd(),
  resolve: { alias: { "@": process.cwd() } },
  server: { host: "127.0.0.1", port: 5194, strictPort: true },
});
let both = true;
server.middlewares.use((req, res, next) => {
  if (req.url === "/api/account/connections") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ accounts: [
      {provider:"google",connected:true,available:true,canDisconnect:both},
      {provider:"discord",connected:both,available:true,canDisconnect:both},
    ] }));
  } else if (req.url === "/api/sign-in-providers") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({providers:["google","discord"]}));
  } else if (req.url === "/api/auth/unlink-account") {
    both=false;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({status:true}));
  } else if (req.url === "/" || req.url === "/landing") {
    res.setHeader("Content-Type", "text/html");
    void server.transformIndexHtml("/", '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/helpers/auth-ui-preview.tsx"></script></body></html>').then(html=>res.end(html));
  } else next();
});
await server.listen();
console.log(`Local auth UI fixture: http://127.0.0.1:5194/ (${resolve("tests/helpers/auth-ui-preview.tsx")})`);
