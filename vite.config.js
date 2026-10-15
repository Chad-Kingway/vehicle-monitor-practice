import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = { "/api": env.SERVER_URL || "http://127.0.0.1:8000" };
  return {
    define: {
      "import.meta.env.ACCESS_KEY": JSON.stringify(env.ACCESS_KEY || ""),
      "import.meta.env.ACCESS_TOKEN": JSON.stringify(env.ACCESS_TOKEN || ""),
    },
    server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy },
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          dispatch: fileURLToPath(new URL("./dispatch.html", import.meta.url)),
          uiTemplate: fileURLToPath(new URL("./ui-template.html", import.meta.url)),
        },
      },
    },
  };
});
