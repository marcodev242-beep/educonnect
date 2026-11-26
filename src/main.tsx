
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import "./styles/index.css";

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js?v=2").catch(error => {
        console.warn("Installation PWA indisponible pour le moment :", error);
      });
    });
  }

  createRoot(document.getElementById("root")!).render(<App />);
  
