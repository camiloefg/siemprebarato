import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number.parseInt(process.env.ADMIN_PORT || "5178", 10),
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.API_PORT || "3020"}`,
        changeOrigin: false,
      },
    },
  },
});
