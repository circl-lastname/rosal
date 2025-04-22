import * as fs from "node:fs";

let templates = {};

export function loadTemplates() {
  const files = fs.readdirSync("templates");
  
  for (let file of files) {
    templates[file.replace(/\.html$/, "")] = fs.readFileSync(`templates/${file}`, "utf8");
  }
}

export function populate(name, gaps) {
  if (!templates[name]) {
    throw new Error("Invalid template");
  }
  
  let template = templates[name];
  
  if (gaps) {
    for (let gap in gaps) {
      let text = gaps[gap].toString().replaceAll("&", "&#38;")
                                    .replaceAll("<", "&lt;")
                                    .replaceAll(">", "&gt;")
                                    .replaceAll('"', "&#34;")
                                    .replaceAll("'", "&#39;")
                                    .replaceAll("%", "&#37;")
                                    .replaceAll("@", "&#64;");
      
      template = template.replaceAll(`%%${gap}%%`, text);
      template = template.replaceAll(`%@${gap}@%`, text.replaceAll("\n", "<br>"));
    }
    
    for (let gap in gaps) {
      template = template.replaceAll(`@@${gap}@@`, gaps[gap]);
    }
  }
  
  return template;
}
