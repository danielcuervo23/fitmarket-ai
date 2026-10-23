import { createRoot } from "react-dom/client";
import App from "./app/App";
import { AuthProvider } from "./contexts/AuthContext";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <I18nProvider>
      <App />
    </I18nProvider>
  </AuthProvider>,
);
