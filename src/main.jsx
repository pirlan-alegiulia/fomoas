import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AdminApp from "./AdminApp.jsx";
import PolicyPage from "./PolicyPage.jsx";
import EventPage from "./EventPage.jsx";
import "./index.css";

const path = window.location.pathname;
const isAdmin = path.startsWith("/admin");
const isPolicy = path.startsWith("/policy");
// I permalink degli eventi sono nella sitemap: chi ci arriva da una ricerca
// o da un link condiviso deve vedere l'evento, non la bacheca intera.
const eventoId = path.match(/^\/evento\/([^/]+)/)?.[1];

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdmin ? (
      <AdminApp />
    ) : isPolicy ? (
      <PolicyPage />
    ) : eventoId ? (
      <EventPage id={decodeURIComponent(eventoId)} />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
