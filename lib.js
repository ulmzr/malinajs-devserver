const fsp = require("node:fs/promises");
const malina = require("malinajs");

const injectedScript = `<script>const url="ws://localhost:35729";let socket=new WebSocket(url);socket.onclose=()=>{const e=()=>{socket=new WebSocket(url),socket.onerror=()=>setTimeout(e,2e3),socket.onopen=()=>location.reload()};e()},socket.onmessage=e=>{const{updated:o}=JSON.parse(e.data);if(!o.match(/\.(scss|css)/i))return location.reload();const t=document.querySelector('link[href*="'+o+'"]'),n=new URL(t.href),s=t.cloneNode();s.onload=()=>t.remove(),s.href=n.pathname+"?"+(Date.now()+"").slice(-5),t.parentNode.insertBefore(s,t.nextSibling)};</script>`;

const mainJS = `import App from './App.xht';
App(document.body);
`;

const appXHT = `<script>
   import Router from 'malinajs-trouter';
   import routes from './routes';

   let cmp, params, active, uri;

   Router(routes(run), ()=> run(import('./modules/Error.xht')));

   function run(dynImport, obj) {
      params = obj;
      if (typeof dynImport === 'function') {
         cmp = dynImport;
      } else {
         dynImport.then( modules => cmp = modules.default);
      }
   }

   $: location.pathname, ()=> {
      uri = location.pathname;
      active = uri.split('/')[1] || 'home';
   }
</script>

{#if cmp}
   <article>
      <component:cmp {params} />
   </article>
{/if}

<style global>
   *, *::before, *::after {
      box-sizing: border-box
   }

   * {
      margin-top: 0;
   }

   body {
      font-family: var(--fonts, system-ui);
      line-height: 1.5;
      text-rendering: optimizeSpeed;
      -webkit-font-smoothing: antialiased;
   }

   h1, h2, h3, h4, h5, h6 {
      line-height: 1.125; 
   }

   h1 {
      font-size: 2em;
   }

   img, svg {
      width: 100%;
      height: auto;
   }

   svg {
      fill: currentColor;
   }

   input, button, textarea, select {
      font: inherit;
   }

   .button {
      --color: #aab2bd;
      --colorse: #aab2bdcc;
      --hover: #96a0ad55;
      --focus: #aab2bd99;
      --border: #96a0ad;
      display: inline-block;
      vertical-align: middle;
      white-space: nowrap;
      padding: 0.3125em 0.875em;
      border-radius: 0.5em;
      height: 2.25em;
      text-align: center;
      color: #fff;
      text-shadow: 0 1px 0 #656d78;
      background: var(--color);
      border: 1px solid var(--border);
      text-decoration: none;
      user-select: none;
      cursor: pointer;
   }

   .button:hover {
      z-index: 3;
      box-shadow: 0 0 0 3px var(--hover);
   }

   .button:focus {
      z-index: 2;
      box-shadow: 0 0 0 3px var(--focus);
   }

   .button:active {
      z-index: 3;
      box-shadow: inset 0 0 0 1px var(--border);
   }

   .button[disabled] {
      box-shadow: none;
      text-decoration: none;
      cursor: not-allowed;
      opacity: 0.3;
   }

   .button * {
      pointer-events: none;
   }

   [type=text], [type=password], [type=email] {
      display: inline-block;
      white-space: nowrap;
      padding: 0.3125em 0.875em;
      border-radius: 0.5em;
      background: inherit;
      height: 2.25em;
      border: 1px solid #ccd1d9;
      outline: none;
   }

   [type=text]:focus, [type=password]:focus, [type=email]:focus {
      border-color: transparent;
      box-shadow: 0 0 0 3px #4a89dc55;
   }

   hr {
      margin: 1.5em 0;
      height: 1px;
      border: none;
      background: #bbb;
   }

   hgroup :first-child{
      margin-bottom: .25em;
   }

   hgroup :not(:first-child){
      color: #999;
   }

   article {
      padding: 1em;
      margin: 0 auto;
      width: 900px;
   }
</style>
`;

const indexHTML = `<!DOCTYPE html>
<html lang='en'>
<head>
   <meta charset='UTF-8'>
   <meta http-equiv='X-UA-Compatible' content='IE=edge'>
   <meta name='viewport' content='width=device-width, initial-scale=1.0'>
   <title>Malina App</title>
   <link rel='stylesheet' href='/main.css'>
   <script defer src='/main.js'></script>
</head>
<body id='app'></body>
</html>`;

const errorXHT = `<script>
   export let code = 404;
   export let msg = 'Page not found!';
</script>

<hgroup>
   <h1>{code}</h1>
   <h6>{msg}</h6>
</hgroup>

<style>
   hgroup {
      text-align: center;
   }

   hgroup * {
      text-transform: uppercase;
      letter-spacing: 2px;
   }
</style>
`;

const homeXHT = `<hgroup>
   <h1>Home</h1>
   <h3>Your are at home</h3>
</hgroup>
<hr>
<p>Lorem ipsum ....</p>
<a href="/about/us" class="button">About Us</a>
`;

const aboutXHT = `<script>
   export let params;
   let page;
   $:params, page = params.page;
</script>

<hgroup>
   <h1>About</h1>
   <h3>Something {page}</h3>
</hgroup>
<hr>
<p>Nothing much here...</p>
<a href="/" class="button">Home</a>
`;

const cmpXHT = `<script>
   export let params;

   let page;
   
   $:params, page = params.page;
</script>

<hgroup>
   <h1>Title</h1>
   <h3>Params {page}</h3>
</hgroup>

<hr>`;

const cmpDirXHT = `<script>
   export let params;
   import load from './';
   
   let cmp = '';
   const dynImport = dyn => dyn.then(m=>cmp=m.default);
   
   $:params, load(params.page, dynImport);
</script>

{#if cmp}
   <!--Chapter/-->
   <component:cmp/>
   <!--Footnote/-->
{:else}
   <Error/>
{/if}
`;

const routesJS = `export default run => [
   {
      path: '/',
      view: ()=> run(import('./pages/Home.xht'))
   }
]`;

const malinaConfig = `const sassPlugin = require('malinajs/plugins/sass');
const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const dirs = ['pages', 'cmp', 'modules'];

module.exports = function (option, filename) {
   option.css = false;
   option.passClass = false;
   option.immutable = true;
   option.plugins = [sassPlugin()];
   option.autoimport = (name) => {
      let fileMatch = '';
      let filePath = '';
      let fileIdxPath = '';
      let whereAmI = filename
         .replace(/^.+src|[^\\\\]+\$/g, '')
         .split('\\\\')
         .slice(1)
         .slice(0, -1);
      whereAmI = whereAmI.map((item) => (item = '..'));
      whereAmI = whereAmI.join('/');
      dirs.forEach((dir) => {
         filePath = path
            .join(cwd, 'src', dir, name + '.xht')
            .replaceAll('\\\\', '/');
         fileIdxPath = path
            .join(cwd, 'src', dir, name.toLowerCase() + '/index.xht')
            .replaceAll('\\\\', '/');

         if (fs.existsSync(filePath)) {
            fileMatch = filePath.split('src')[1];
            return;
         } else if (fs.existsSync(fileIdxPath)) {
            fileMatch = fileIdxPath.split('src')[1];
            return;
         }
      });
      if (fileMatch) return \`import \${name} from './\${whereAmI}\${fileMatch}';\`;
      else return \`import \${name} from './\${name}.xht';\`;
   };
   return option;
};

`;

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

module.exports = {
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
};
