import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

const buildOptions = {
  entryPoints: {
    popup: "popup.ts",
    background: "background.ts",
  },
  bundle: true,
  format: "iife",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  minify: prod,
  outdir: ".",
};

if (prod) {
  await esbuild.build(buildOptions);
} else {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
}
