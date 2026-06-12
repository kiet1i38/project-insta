import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./app/router";
import { AuthSessionProvider } from "./modules/auth/authSession";

function App() {
  return (
    <AuthSessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthSessionProvider>
  );
}

export default App;
