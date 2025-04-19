import { config } from "./index.js";
import { populate } from "./template.js";

export function handleFrontPage(req, path, res) {
  res.setHeader("Content-Type", "text/html");
  res.end(populate("main", { forumName: config.name, pageName: "Front page" }));
}
