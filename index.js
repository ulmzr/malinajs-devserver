const malina = require("malinajs");
const esbuild = require("esbuild");
const chokidar = require("chokidar");
const ws = require("ws");

const http = require("http");
const fsp = require("fs/promises");
const fs = require("fs");
const path = require("path");

const cwd = process.cwd();

const watch = process.argv.includes("-w");

const optsPath = path.join(cwd, "options.js");
const esBuildConfigPath = path.join(cwd, "esbuild.config.js");
const opts = fs.existsSync(optsPath) ? require(optsPath) : {};
const options = fs.existsSync(esBuildConfigPath)
   ? require(esBuildConfigPath)
   : {};

const port = opts.port || 3000;
const outdir = opts.outdir || "public";

let ready;

build();

if (watch) {
   startServer();
   watchChanges();
}

async function build() {
   let ctx = await esbuild.context({
      entryPoints: [path.join(cwd, "src", "main.js")],
      outdir: path.join(cwd, outdir),
      minify: true,
      bundle: true,
      plugins: [malinaPlugin()],
      ...options,
   });

   await ctx.watch();

   if (!watch) await ctx.dispose();
}

const injectedScript = `<script>const url="ws://localhost:35729";let socket=new WebSocket(url);socket.onclose=()=>{const e=()=>{socket=new WebSocket(url),socket.onerror=()=>setTimeout(e,2e3),socket.onopen=()=>location.reload()};e()},socket.onmessage=e=>{const{updated:o}=JSON.parse(e.data);if(!o.match(/\.(scss|css)/i))return location.reload();const t=document.querySelector('link[href*="'+o+'"]'),n=new URL(t.href),s=t.cloneNode();s.onload=()=>t.remove(),s.href=n.pathname+"?"+(Date.now()+"").slice(-5),t.parentNode.insertBefore(s,t.nextSibling)};</script>`;

function startServer() {
   const index = () =>
      fs.readFileSync(path.join(cwd, outdir, "index.html"), "utf8") +
      injectedScript;

   const mime = (ext) => {
      let map = {
         bin: "application/octet-stream",
         pdf: "application/pdf",
         json: "application/json",
         webmanifest: "application/json",
         html: "text/html, charset=UTF-8",
         js: "text/javascript",
         css: "text/css",
         ico: "image/x-icon",
         png: "image/png",
         jpg: "image/jpeg",
         webp: "image/webp",
         svg: "image/svg+xml",
         wav: "audio/wav",
         mp3: "audio/mpeg",
         mp4: "video/mp4",
         webm: "video/webm",
      };
      return map[ext] || map.bin;
   };

   const handler = (request, response) => {
      let url = request.url.replace(/(.*\/|\?.*)$/g, "") || "/";
      let arr = url.split(".");
      let content, code = 200;
      if (arr[1]) {
         response.setHeader("Content-Type", mime(arr[1]));
         let filename = path.join(cwd, outdir, url);
         if (fs.existsSync(filename)) {
            content = fs.readFileSync(filename);
         } else {
            code = 404;
         }
      } else {
         response.setHeader("Content-Type", "text/html");
         content = index();
      }
      console.log(code===200?'200':code, url);
      response.statusCode = code;
      response.end(content);
   };

   let server = http.createServer(handler);
   server.listen(port);
}

function malinaPlugin(options = {}) {
   const cssModules = new Map();

   if (options.displayVersion !== false)
      console.log("! Malina.js", malina.version);

   return {
      name: "malina-plugin",
      setup(build) {
         build.onLoad({ filter: /\.(xht|ma|html)$/ }, async (args) => {
            let source = await fsp.readFile(args.path, "utf8");

            let ctx = await malina.compile(source, {
               path: args.path,
               name: args.path.match(/([^/\\]+)\.\w+$/)[1],
               ...options,
            });

            let code = ctx.result;

            if (ctx.css.result) {
               const cssPath = args.path
                  .replace(/\.\w+$/, ".malina.css")
                  .replace(/\\/g, "/");
               cssModules.set(cssPath, ctx.css.result);
               code += `\nimport "${cssPath}";`;
            }

            return { contents: code };
         });

         build.onResolve({ filter: /\.malina\.css$/ }, ({ path }) => {
            return { path, namespace: "malinacss" };
         });

         build.onLoad(
            { filter: /\.malina\.css$/, namespace: "malinacss" },
            ({ path }) => {
               const css = cssModules.get(path);
               return css ? { contents: css, loader: "css" } : null;
            }
         );
      },
   };
}

function watchChanges() {
   let socket = new ws.Server({
      port: 35729,
   });

   chokidar
      .watch([outdir], {
         ignored: /(^|[\/\\])\../,
         persistent: true,
         cwd,
      })
      .on("change", (filePath) => {
         filePath = filePath.replace(/\\/g, "/").replace(outdir, "");
         socket.clients.forEach((client) => {
            client.send(
               JSON.stringify({
                  updated: filePath,
               })
            );
         });
      });

   chokidar
      .watch(["src/**/*"], {
         ignored: /(^|[\/\\])\../,
         persistent: true,
         cwd,
      })
      .on("change", async (filePath) => {
         if (!filePath.endsWith("css")) return;
         await ctx.rebuild();
      })
      .on("add", reIndex)
      .on("unlink", reIndex)
      .on("addDir", (ev) => {
         if (!ready) return;
         let dirName = ev.replace(/.*\\/g, "");
         let dirPath = path.join(cwd, "src", "pages", dirName);
         let isCmp = /[A-Z]/.test(dirName.charAt(0));
         let content = "";
         if (isCmp)
            content += `<script>
   export let params;
   let page;
   $:params, page = params.page;
</script>

<h3>{page}</h3>
`;
         else
            content += `<script>
   export let params;
   import load from './pages';
   let cmp = '';
   const dynImport = dyn => dyn.then(m=>cmp=m.default);
   $:params, load(params.page, dynImport);
</script>

{#if cmp}
   <!--Chapter/-->
   <component:cmp/>
   <!--Footnote/-->
{:else}
   <E404/>
{/if}
`;
         if (isCmp) fs.writeFileSync(path.join(dirPath, "index.xht"), content);
         else {
            fs.writeFileSync(path.join(dirPath, "pageIndex.xht"), content);
            fs.writeFileSync(path.join(dirPath, "pages.js"), "");
         }
      })
      .on("unlinkDir", makeRoutes)
      .on("ready", () => {
         ready = true;
         makeRoutes();
      });
}

function reIndex(filePath) {
   if (!filePath.endsWith("xht")) return;
   if (!ready) return;
   if (!fs.existsSync("./src/pages/E404.xht")) {
      fs.writeFileSync(
         "./src/pages/E404.xht",
         `<div>
   <h1>404</h1>
   <h6>PAGE NOT FOUND</h6>
</div>
<style>
   div {
      padding: 3em 0;
   }
   div * {
      text-align: center;
   }
</style>
      `
      );
   }

   let fileName = filePath.replace(/.*\\/g, "");
   let dirName = filePath.replace(fileName, "");

   if (!fs.existsSync(dirName)) return;

   let files = fs.readdirSync(dirName);

   files = files.filter((f) => {
      return f.startsWith("+") && f.endsWith(".xht");
   });

   if (files.length) {
      let content = "export default (page, dyn)=>{\n";
      files.forEach((f) => {
         content += `\tif (page=="${f
            .replace(/(\+|.xht)/g, "")
            .replace(".xht")}") dyn(import("./${f}"));\n`;
      });
      content += `}`;
      let filePath = path.join(dirName, "index.js");
      fs.writeFileSync(filePath, content);
   }
   makeRoutes();
}

function makeRoutes() {
   const getAllFiles = function (dirPath, arrayOfFiles) {
      let files = fs.readdirSync(dirPath);
      arrayOfFiles = arrayOfFiles || [];
      files.forEach(function (file) {
         if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
         } else {
            arrayOfFiles.push(path.join(cwd, dirPath, "/", file));
         }
      });
      return arrayOfFiles;
   };

   let dirPath = path.join(cwd, "src", "pages");
   let files = getAllFiles(dirPath);

   files = files.filter((f) => {
      let cmpIdx = f.includes("index.xht");
      f = f.replace(/.*(\\|\/)/, "");
      let match =
         ((/[A-Z]/.test(f.charAt(0)) && f.endsWith(".xht"))) ||
         f.startsWith("pageIndex.xht");
      return match || cmpIdx;
   });
   
   let content = `export default run => [\n`;
   files.forEach((file) => {
      let filePath = file.split("src")[1];
      filePath = filePath.replaceAll("\\", "/");
      content += "\t{\n";
      if (filePath.endsWith("pageIndex.xht")) {
         filePath = filePath
            .replace("/pageIndex.xht", "")
            .replace(/.*\//g, "/");
         content += `\t\tpath: "${filePath}/:page",\n`;
         content += `\t\tpage: obj => run(import("./pages${filePath}/pageIndex.xht"), obj),\n`;
      } else if (filePath.endsWith("index.xht")) {
         filePath = filePath.replace("/index.xht", "").replace(/.*\//g, "/");
         content += `\t\tpath: "${filePath.toLowerCase()}/:page",\n`;
         content += `\t\tpage: obj => run(import("./pages${filePath}/index.xht"), obj),\n`;
      } else {
         filePath = filePath.replace(".xht", "").replace(/.*\//g, "/");
         let pathName = filePath === "/Home" ? "/" : filePath;
         content += `\t\tpath: "${pathName.toLowerCase()}",\n`;
         content += `\t\tpage: () => run(import("./pages${filePath}.xht")),\n`;
         
      }
      content += `\t},\n`;
   });
   content += `];`;
   

   fs.writeFileSync(path.join(cwd, "src", "routes.js"), content);
}
