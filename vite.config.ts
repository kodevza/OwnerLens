import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import {
  createDefaultLocalReportRuntime,
  installLocalReportRuntimeRest
} from "./src/providers/azure/runtime/localReportRuntimeRest";

function localReportRuntimeApi(): Plugin {
  const runtime = createDefaultLocalReportRuntime(process.env.OWNERLENS_DATA_DIR ?? process.cwd());

  return {
    name: "ownerlens-local-report-runtime-api",
    configureServer(server) {
      installLocalReportRuntimeRest(server, runtime);
    },
    configurePreviewServer(server) {
      installLocalReportRuntimeRest(server, runtime);
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localReportRuntimeApi()]
});
