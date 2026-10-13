import { defineConfig, loadEnv } from "vite";

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
  };
});
