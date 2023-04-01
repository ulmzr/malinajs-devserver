const { init, build, serve, watch } = require("./lib");

const dev = process.argv.includes("-w");

init();

build(dev).then(async (ctx) => {
   if (!dev) {
      await ctx.dispose();
      return;
   }
   const server = serve(dev);
   watch(server, ctx);
});

