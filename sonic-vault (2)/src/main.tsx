import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === "string" && args[0].includes("Unknown event handler property")) return;
  if (typeof args[0] === "string" && args[0].includes("The play() request was interrupted")) return;
  if (args[0] && args[0].message && args[0].message.includes("The play() request was interrupted")) return;
  originalError(...args);
};

window.addEventListener("unhandledrejection", (event) => {
  if (
    event.reason &&
    event.reason.message &&
    (event.reason.message.includes("The play() request was interrupted") ||
      event.reason.message.includes("play() failed because the user didn't interact"))
  ) {
    event.preventDefault(); // Prevent the error overlay
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
