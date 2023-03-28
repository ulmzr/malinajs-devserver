const esbuild = require("esbuild");
const chokidar = require("chokidar");
const ws = require("ws");

const http = require("http");
const fs = require("fs");
const path = require("path");

const {
   mainJS,
   appXHT,
   indexHTML,
   errorXHT,
   homeXHT,
   aboutXHT,
   cmpXHT,
   cmpDirXHT,
   routesJS,
   malinaConfig,
   injectedScript,
   mime,
   malinaPlugin,
} = require("./lib");

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

let ready, ctx;

init();
build();

if (watch) {
   startServer();
   watchChanges();
}

function init() {
   createDir("public");
   createDir("src");
   createDir("src/cmp");
   createDir("src/libs");
   createDir("src/modules");
   createDir("src/stores");
   createDir("src/pages");
   createDir("src/pages/About");
   createFile("src/main.js", mainJS);
   createFile("src/App.xht", appXHT);
   createFile("public/index.html", indexHTML);
   createFile("src/modules/Error.xht", errorXHT);
   createFile("src/pages/Home.xht", homeXHT);
   createFile("src/pages/About/index.xht", aboutXHT);
   createFile("src/routes.js", routesJS);
   createFile("malina.config.js", malinaConfig);
}

function createFile(fileName, content) {
   let pathName = path.join(cwd, fileName);
   if (!fs.existsSync(pathName)) {
      fs.writeFileSync(pathName, content);
   }
}

function createDir(dirName) {
   if (!fs.existsSync(path.join(cwd, dirName))) {
      fs.mkdirSync(path.join(cwd, dirName));
   }
}

async function build() {
   ctx = await esbuild.context({
      entryPoints: [path.join(cwd, "src", "main.js")],
      outdir: path.join(cwd, outdir),
      minify: watch ? false : true,
      bundle: true,
      plugins: [malinaPlugin()],
      ...options,
   });

   await ctx.watch();

   if (!watch) await ctx.dispose();
}

function startServer() {
   const index = () =>
      fs.readFileSync(path.join(cwd, outdir, "index.html"), "utf8") +
      injectedScript;

   const handler = (request, response) => {
      let url = request.url.replace(/(.*\/|\?.*)$/g, "") || "/";
      let arr = url.split(".");
      let content,
         code = 200;
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
      console.log(code === 200 ? "200" : code, url);
      response.statusCode = code;
      response.end(content);
   };

   let server = http.createServer(handler);
   server.listen(port);
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
      .watch(["src/**/*.css", "src/**/*.scss"], {
         ignored: /(^|[\/\\])\../,
         persistent: true,
         cwd,
      })
      .on("change", async (filePath) => {
         if (!ctx) return;
         await ctx.rebuild();
      });
   chokidar
      .watch(["src/pages/**/*"], {
         ignored: /(^|[\/\\])\../,
         persistent: true,
         cwd,
      })
      .on("add", reIndex)
      .on("unlink", reIndex)
      .on("addDir", (ev) => {
         if (!ready) return;
         let dirName = ev.replace(/.*\\/g, "");
         let dirPath = path.join(cwd, "src", "pages", dirName);
         let isCmp = /[A-Z]/.test(dirName.charAt(0));
         let content = "";
         if (isCmp) content = cmpXHT;
         else content = cmpDirXHT;
         if (isCmp) fs.writeFileSync(path.join(dirPath, "index.xht"), content);
         else {
            fs.writeFileSync(path.join(dirPath, "pageIndex.xht"), content);
            fs.writeFileSync(
               path.join(dirPath, "index.js"),
               "export default () => {};"
            );
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
         arrayOfFiles.push(path.join(cwd, "src/pages", file));
      });
      return arrayOfFiles;
   };

   let dirPath = path.join(cwd, "src", "pages");
   let files = getAllFiles(dirPath);
   //let files = fs.readdirSync(dirPath);

   files = files.filter((f) => {
      let isDir = fs.statSync(f).isDirectory();
      f = f.replace(/.*(\\|\/)/, "");
      let match = (/[A-Z]/.test(f.charAt(0)) && f.endsWith(".xht")) || isDir;
      return match || cmpIdx || isDir;
   });

   let content = `export default run => [\n`;
   files.forEach((file) => {
      let filePath = file.split("src")[1];
      filePath = filePath.replace(/\\/g, "/");
      content += "\t{\n";
      if (fs.statSync(path.join(cwd, "src", filePath)).isDirectory()) {
         let dirName = filePath.replace(/.*\//g, "");
         if (/[A-Z]/.test(dirName.charAt(0))) {
            filePath = filePath.replace(/.*\//g, "/");
            content += `\t\tpath: "${filePath.toLowerCase()}/:page",\n`;
            content += `\t\tpage: obj => run(import("./pages${filePath}/index.xht"), obj),\n`;
         } else {
            filePath = filePath.replace(/.*\//g, "/");
            content += `\t\tpath: "${filePath}/:page",\n`;
            content += `\t\tpage: obj => run(import("./pages${filePath}/pageIndex.xht"), obj),\n`;
         }
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
