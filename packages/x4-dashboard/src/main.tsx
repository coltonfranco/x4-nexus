import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";
import { router } from "./router";
import { SettingsProvider } from "./lib/settingsStore";
import { BackgroundRefresh } from "./lib/useBackgroundRefresh";
import { SetupGate } from "./components/setup/SetupGate";

// Apply saved theme before first render to prevent flash.
const savedTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
  document.documentElement.classList.add("dark");
}

// Tauri fullscreen toggle: F11 uses the native window API so the entire window
// (chrome included) goes fullscreen, not just the webview content area.
if ("__TAURI__" in window) {
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    document.addEventListener("keydown", async (e) => {
      if (e.key === "F11") {
        e.preventDefault();
        const win = getCurrentWindow();
        await win.setFullscreen(!(await win.isFullscreen()));
      }
    });
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <TooltipProvider>
          <SetupGate>
            <BackgroundRefresh />
            <RouterProvider router={router} />
          </SetupGate>
        </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
