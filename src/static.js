import * as fs from "node:fs";

import { sendError } from "./index.js"
import staticFileInfo from "../static/info.json" with { type: "json" };

let staticFiles = {};

export function loadStaticFiles() {
  for (let file in staticFileInfo) {
    staticFiles[file] = {
      data: fs.readFileSync(`static/${file}`),
      type: staticFileInfo[file]
    };
  }
}

export function handleStaticRequest(req, path, res) {
  if (path.length === 2 && staticFiles[path[1]]) {
    res.setHeader("Content-Type", staticFiles[path[1]].type);
    res.setHeader("Cache-Control", "public, max-age=18000, immutable");
    res.end(staticFiles[path[1]].data);
  } else {
    sendError(res, 404, "Static resource not found");
  }
}
