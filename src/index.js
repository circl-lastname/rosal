import * as fs from "node:fs";
import * as http from "node:http";

import { loadStaticFiles, handleStaticRequest } from "./static.js"
import { loadTemplates, populate } from "./template.js"

import { handleFrontPage } from "./pages.js";

export let config;

const defaultConfig = {
  // Customization
  name: "Rosal-based forum",
  // Protocol 
  port: 8080,
  useHttps: false,
  // Environment
  logDir: "log",
};

console.log("Rosal | Simple Old-School Forum Software");

try {
  config = JSON.parse(fs.readFileSync("config.json", "utf8"));
} catch (e) {
  if (e.code === "ENOENT") {
    config = defaultConfig;
    fs.writeFileSync("config.json", JSON.stringify(defaultConfig, null, 2));
    
    console.log("Initial config created - Welcome to Rosal!");
  } else {
    throw e;
  }
}

loadStaticFiles();
loadTemplates();

export function sendError(res, code, message) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html");
  res.end(populate("error", { code: code, message: message }));
}

function handleRequest(req, res) {
  res.setHeader("Server", "Rosal");
  
  let path;
  
  try {
    path = req.url.split("/").slice(1).map(decodeURIComponent);
  } catch {
    sendError(res, 400, "Malformed URL");
    return;
  }
  
  switch (path[0]) {
    case "":
      handleFrontPage(req, path, res);
    break;
    case "static":
      handleStaticRequest(req, path, res);
    break;
    default:
      sendError(res, 404, "Not found");
  }
}

const server = http.createServer(handleRequest);

server.listen(config.port, () => {
  console.log(`Listening on port ${config.port} (HTTP)`);
});
