const sassPlugin = require("malinajs/plugins/sass");
const fs = require("fs");
const path = require("path");
const cwd = process.cwd();
const dirs = ["pages", "cmp", "module"];

module.exports = function (option, filename) {
   option.css = false;
   option.passClass = false;
   option.hideLabel = true;
   option.immutable = true;
   option.plugins = [sassPlugin()];
   option.autoimport = (name) => {
      let fileMatch = "";
      let filePath = "";
      let fileIdxPath = "";
      let whereAmI = filename
         .replace(/^.+src|[^\\]+$/g, "")
         .split("\\")
         .slice(1)
         .slice(0, -1);
      whereAmI = whereAmI.map((item) => (item = ".."));
      whereAmI = whereAmI.join("/");
      dirs.forEach((dir) => {
         filePath = path
            .join(cwd, "src", dir, name + ".xht")
            .replaceAll("\\", "/");
         fileIdxPath = path
            .join(cwd, "src", dir, name.toLowerCase() + "/index.xht")
            .replaceAll("\\", "/");

         if (fs.existsSync(filePath)) {
            fileMatch = filePath.split("src")[1];
            return;
         } else if (fs.existsSync(fileIdxPath)) {
            fileMatch = fileIdxPath.split("src")[1];
            return;
         }
      });
      if (fileMatch) return `import ${name} from './${whereAmI}${fileMatch}';`;
      else return `import ${name} from './${name}.xht';`;
   };
   return option;
};
