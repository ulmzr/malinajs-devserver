const esbuild = require("esbuild");
const malina = require("malinajs");
const { join } = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const cwd = process.cwd();
const options = {};
const opts = {};

const port = opts.port || 3000;
const outdir = opts.outdir || "public";

let socket;

const mainjsContent = `import App from './App.xht';
App(document.body);`;

const appxhtContent = `<script>
   import Router from 'malinajs-trouter';
   import routes from './routes';

   let cmp, params, active, uri;

   const error404 = import('./module/Error.xht'); 

   Router(routes, result => {
      cmp = result.cmp;
      params = result.params;
   }, error404);

   $: location.pathname, async () => {
      uri = location.pathname;
      active = uri.split("/")[1] || "home";
   }
</script>

<Sidebar></>

{#if cmp}
   <Main>
      <component:cmp {params}/>
   </>
{/if}


<style global>
</style>
`;

const errorxhtContent = `<script>
   export let num = 404;
   export let nfo = 'page not found';
   export let msg = 'Page you are looking for is not found.<br>Probably eaten by a snake.';
</script>

<hgroup>
   <h1>{num}</h1>
   <h6>{nfo}</h6>
   <p>{@html msg}</p>
</hgroup>

<style>
   hgroup {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 3em 0;
   }

   h6 {
      text-transform: uppercase;
      color: #bbb;
      margin-bottom: 1em;
      letter-spacing: 5px;
   }

   p {
      line-height: 1.25;
      font-size: .75em;
   }
</style>
`;

const indexhtmlContent = `<!DOCTYPE html>
<html lang="en">
   <head>
      <meta charset="UTF-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Document</title>
      <link rel="icon" href="/logo.svg" />
      <link rel="stylesheet" href="/main.css" />
      <script defer src="/main.js"></script>
   </head>
   <body></body>
</html>
`;

const logosvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 490 490">
   <path fill="#4A89DC" d="m0 186 107 62 108-62V63L107 1 0 63z"/>
   <path fill="#8CC152" d="M275 63v123l108 62 107-62V63L383 1z"/>
   <path fill="#F6BB42" d="M138 304v123l107 62 107-62V304l-107-62z"/>
</svg>`;

const injectedScript = `<script>let u="ws://localhost:${port}",s=new WebSocket(u);s.onclose=o=>{let e=o=>(s=new WebSocket(u),s.onerror=o=>setTimeout(e,2e3),s.onopen=o=>location.reload());e()},s.onmessage=o=>location.reload();</script>`;

const sample = (str) => `<script>
   export let params;
   console.log(params);
</script>
<article>
   <hgroup>
      <h1>${str}</h1>
      <h3>Sub${str.toLowerCase()}</h3>
   </hgroup>
</article>
`;

const pageIndexXht = `<script>
   export let params;
   import load from './';
   
   let cmp;
   const dynImport = o => o.then( m => cmp = m.default);
   
   $: params, load(params.$1, dynImport); 
</script>

{#if cmp}
   <component:cmp {params}/>
{:else}
   <Error/>
{/if}
`;

const indexJs = `export default []`;

function init() {
   let malinaConfigTpl = join(__dirname, "malina.config.js");
   let malinaConfig = join(cwd, "malina.config.js");
   if (!fs.existsSync(malinaConfig)) {
      let content = fs.readFileSync(malinaConfigTpl);
      fs.writeFileSync(malinaConfig, content);
   }
   createFolder("src");
   createFolder(outdir);
   createRoute();
}

function createFolder(str) {
   if (!fs.existsSync(join(cwd, str))) {
      fs.mkdirSync(join(cwd, str));
   }

   if (str.includes("src")) {
      if (!fs.existsSync(join(cwd, "src/main.js"))) {
         fs.writeFileSync(join(cwd, "src/main.js"), mainjsContent);
      }

      if (!fs.existsSync(join(cwd, "src/App.xht"))) {
         fs.writeFileSync(join(cwd, "src/App.xht"), appxhtContent);
      }

      if (!fs.existsSync(join(cwd, str, "cmp"))) {
         fs.mkdirSync(join(cwd, str, "cmp"));
      }

      if (!fs.existsSync(join(cwd, str, "module"))) {
         fs.mkdirSync(join(cwd, str, "module"));
      }

      if (!fs.existsSync(join(cwd, str, "module/Error.xht"))) {
         fs.writeFileSync(join(cwd, str, "module/Error.xht"), errorxhtContent);
      }

      if (!fs.existsSync(join(cwd, "src/pages"))) {
         fs.mkdirSync(join(cwd, "src/pages"));
      }

      if (!fs.existsSync(join(cwd, "src/pages/Home.xht"))) {
         fs.writeFileSync(join(cwd, "src/pages/Home.xht"), sample("Home"));
      }
   } else if (str.includes(outdir)) {
      if (!fs.existsSync(join(cwd, outdir, "index.html"))) {
         fs.writeFileSync(join(cwd, outdir, "index.html"), indexhtmlContent);
      }

      if (!fs.existsSync(join(cwd, outdir, "logo.svg"))) {
         fs.writeFileSync(join(cwd, outdir, "logo.svg"), logosvgContent);
      }
   }
}

async function build(dev) {
   try {
      let ctx = await esbuild.context({
         entryPoints: ["src/main.js"],
         outdir: "public",
         bundle: true,
         minify: dev ? false : true,
         plugins: [malinaPlugin()],
         ...options,
      });
      await ctx.watch();
      return ctx;
   } catch (err) {
      console.error(err);
   }
}

function malinaPlugin(options = {}) {
   const cssModules = new Map();

   if (options.displayVersion !== false)
      console.log("! Malina.js", malina.version);

   return {
      name: "malina-plugin",
      setup(build) {
         build.onLoad({ filter: /\.(xht|ma|html|svg)$/ }, async (args) => {
            let code = "";
            try {
               let source = await fsp.readFile(args.path, "utf8");
               let ctx = await malina.compile(source, {
                  path: args.path,
                  name: args.path.match(/([^/\\]+)\.\w+$/)[1],
                  ...options,
               });
               code = ctx.result;
               if (ctx.css.result) {
                  const cssPath = args.path
                     .replace(/\.\w+$/, ".malina.css")
                     .replace(/\\/g, "/");
                  cssModules.set(cssPath, ctx.css.result);
                  code += `\nimport "${cssPath}";`;
               }
            } catch (err) {
               console.log(err);
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

function mime(ext) {
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
}

function serve(dev) {
   const indexFile = join(cwd, outdir, "index.html");
   let index = "";
   if (fs.existsSync(indexFile)) {
      index += fs.readFileSync(indexFile);
      index += dev ? injectedScript : "";
   }
   return require("node:http")
      .createServer((req, res) => {
         let content,
            code = 200,
            url = req.url.replace(/(.*\/|\?.*)$/g, "") || "/",
            arr = url.split(".");

         if (arr[1]) {
            res.setHeader("Content-Type", mime(arr[1]));
            let filename = join(cwd, outdir, url);
            if (fs.existsSync(filename)) {
               content = fs.readFileSync(filename);
            } else {
               code = 404;
            }
         } else {
            res.setHeader("Content-Type", "text/html");
            content = index;
         }

         if (dev) {
            console.log(code === 200 ? "200" : code, url);
         }

         res.statusCode = code;
         res.end(content);
      })
      .listen(port);
}

function createRoute() {
   let files = [];
   const readDir = (dir) => {
      let path = join(cwd, dir);
      fs.readdirSync(path).forEach((file) => {
         let stats = fs.statSync(join(cwd, dir, file));
         if (stats.isDirectory()) {
            return readDir(join(dir, file));
         } else {
            if (
               /[A-Z]/.test(file.charAt(0)) ||
               file === "index.xht" ||
               file === "pageIndex.xht"
            ) {
               files.push(join(dir, file));
            }
         }
      });
   };
   readDir("src/pages");
   if (files) {
      let content = `export default [\n`;
      files.forEach((file) => {
         file = file.replace(/\\/g, "/");
         file = file.replace("src", "");
         let f = file.replace(/.*\//g, "").replace(".xht", "");
         content += "\t{\n";
         if (f === "index" || f === "pageIndex") {
            let path = file.split("/" + f)[0];
            path = path.replace(/.*\//g, "").toLowerCase();
            content += `\t\tpath: '/${path}/:page',\n`;
            content += `\t\tpage: import('.${file}'),\n`;
         } else {
            let path = f.toLowerCase();
            content += `\t\tpath: '/${path === "home" ? "" : path}',\n`;
            content += `\t\tpage: import('.${file}'),\n`;
         }
         content += "\t},\n";
      });
      content += "];";
      fs.writeFileSync(join(cwd, "src/routes.js"), content);
   }
}

async function watch(server, ctx) {
   const ws = require("ws");
   socket = new ws.WebSocketServer({ server });

   const watcher = require("@parcel/watcher");

   await watcher.subscribe(join(cwd, outdir), (err, ev) => {
      socket?.clients.forEach((client) => {
         client.send("");
      });
   });

   await watcher.subscribe(join(cwd, "src"), async (err, ev) => {
      ev = ev[0];
      if (ev.path.endsWith("css")) {
         await ctx.rebuild();
      } else if (ev.type === "create") {
         let me = ev.path.replace(/.*\\|.*\//, "");
         let stats = fs.statSync(ev.path);
         if (stats.isDirectory()) {
            let cmpIndex = /[A-Z]/.test(me.charAt(0));
            if (cmpIndex) {
               fs.writeFileSync(join(ev.path, "index.xht"), sample(me));
            } else {
               fs.writeFileSync(
                  join(ev.path, "+page.xht"),
                  sample("List of " + me)
               );
               fs.writeFileSync(join(ev.path, "index.js"), indexJs);
               fs.writeFileSync(join(ev.path, "pageIndex.xht"), pageIndexXht);
            }
         } else {
            if (me.startsWith("+") && me.endsWith(".xht")) {
               let content = `export default (page, dynImport)=>{\n`;
               content += `\tif (!page) return;\n`;
               let dir = ev.path.split(me)[0];
               let files = fs.readdirSync(dir).filter((file) => {
                  return file.startsWith("+");
               });
               if (files) {
                  files.forEach((file) => {
                     let str = file.replace(/\+|.xht/g, "");
                     content += `\telse if (page==='${str}') dynImport(import('./${file}'));\n`;
                  });
               }
               content += "}";
               fs.writeFileSync(join(dir, "index.js"), content);
            }
         }
         createRoute();
      } else if (ev.type === "delete") {
         createRoute();
      }
   });
}

module.exports = {
   init,
   build,
   serve,
   watch,
};
