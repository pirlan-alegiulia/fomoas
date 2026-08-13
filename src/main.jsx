import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AdminApp from "./AdminApp.jsx";
import PolicyPage from "./PolicyPage.jsx";
import "./index.css";

const isAdmin = window.location.pathname.startsWith("/admin");
const isPolicy = window.location.pathname.startsWith("/policy");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdmin ? <AdminApp /> : isPolicy ? <PolicyPage /> : <App />}
  </React.StrictMode>
);
