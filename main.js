import { createServer } from "http"
import { readFile } from "fs/promises";

createServer(async (req, res) => {
    const [
        html_file,
        css_file,
        js_file
    ] = await Promise.all([
        readFile("public/index.html", "utf-8"),
        readFile("public/index.css", "utf-8"),
        readFile("public/index.js", "utf-8"),
    ]);

    const css_split = html_file.split("<!---->");
    const js_split = (css_split[0] + css_file + css_split[1]).split("// hey");
    const html_source = js_split[0] + js_file + js_file.split[1];

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html_source);
}).listen(8080)