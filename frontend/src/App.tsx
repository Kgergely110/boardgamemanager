import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthPanel } from "./components/AuthPanel";
import { api, getErrorMessage, setAuthToken } from "./lib/api";
import { Ambience } from "./pages/Ambience";
import { GameDetails } from "./pages/GameDetails";
import { Library } from "./pages/Library";
import { LetsPlay } from "./pages/LetsPlay";
import { OngoingGame } from "./pages/OngoingGame";
import { PlayLogs } from "./pages/PlayLogs";
import { Wiki } from "./pages/Wiki";
import { Wishlist } from "./pages/Wishlist";
import { scrollToPageTop } from "./lib/navigation";
import { AuthResponse, Player } from "./types";
import "./index.css";

type AppScreen = "loading" | "setup" | "login" | "library" | "offline";

function AuthenticatedApp({ player, onLogout }: { player: Player; onLogout: () => void }) {
  const navigate = useNavigate();
  function logout() {
    navigate("/", { replace: true });
    onLogout();
  }

  return (
    <Routes>
      <Route path="/games/:gameId" element={<GameDetails player={player} onLogout={logout} />} />
      <Route path="/lets-play/ongoing/:ongoingGameId" element={<OngoingGame player={player} onLogout={logout} />} />
      <Route path="/lets-play" element={<LetsPlay player={player} onLogout={logout} />} />
      <Route path="/logs" element={<PlayLogs player={player} onLogout={logout} />} />
      <Route path="/wiki" element={<Wiki player={player} onLogout={logout} />} />
      <Route path="/ambience" element={<Ambience player={player} onLogout={logout} />} />
      <Route path="/wishlist" element={<Wishlist player={player} onLogout={logout} />} />
      <Route path="*" element={<Library player={player} onLogout={logout} />} />
    </Routes>
  );
}

function App() {
  const { pathname } = useLocation();
  const [screen, setScreen] = useState<AppScreen>("loading");
  const [player, setPlayer] = useState<Player | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    scrollToPageTop();
  }, [pathname]);

  async function refreshEntryState() {
    setScreen("loading");
    setError("");
    try {
      const { data } = await api.get<{ setupRequired: boolean }>("/auth/status");
      setSetupRequired(data.setupRequired);

      const token = sessionStorage.getItem("library-token");
      if (token) {
        try {
          const current = await api.get<{ player: Player }>("/auth/me");
          setPlayer(current.data.player);
          setScreen("library");
          return;
        } catch {
          setAuthToken(null);
        }
      }

      setScreen(data.setupRequired ? "setup" : "login");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setScreen("offline");
    }
  }

  useEffect(() => {
    void refreshEntryState();
  }, []);

  useEffect(() => {
    if (screen === "setup") {
      document.title = "The First Keeper | The Game Library";
    } else if (screen === "login") {
      document.title = "Welcome Back | The Game Library";
    } else if (screen === "offline") {
      document.title = "Library Offline | The Game Library";
    } else if (screen === "loading") {
      document.title = "Opening the Library | The Game Library";
    } else if (pathname === "/logs") {
      document.title = "The Chronicle | The Game Library";
    } else if (pathname.startsWith("/lets-play/ongoing/")) {
      document.title = "Game in Progress | The Game Library";
    } else if (pathname === "/lets-play") {
      document.title = "Let’s Play | The Game Library";
    } else if (pathname === "/wiki") {
      document.title = "The Field Guide | The Game Library";
    } else if (pathname === "/ambience") {
      document.title = "Game Atmospheres | The Game Library";
    } else if (pathname === "/wishlist") {
      document.title = "The Wish List | The Game Library";
    } else if (pathname.startsWith("/games/")) {
      document.title = "Game Dossier | The Game Library";
    } else {
      document.title = "The Stacks | The Game Library";
    }
  }, [pathname, screen]);

  function handleAuthenticated(result: AuthResponse) {
    setAuthToken(result.token);
    setPlayer(result.player);
    setScreen("library");
  }

  function handleLogout() {
    setPlayer(null);
    setScreen("login");
  }

  if (screen === "loading") {
    return <main className="boot-screen" role="status" aria-live="polite"><p>Opening the library…</p></main>;
  }

  if (screen === "offline") {
    return (
      <main className="boot-screen boot-screen--error">
        <span className="eyebrow">THE LIGHTS ARE LOW</span>
        <h1>We can’t reach the library.</h1>
        <p>{error}</p>
        <button className="button button--primary" onClick={() => void refreshEntryState()}>Try again</button>
      </main>
    );
  }

  if (screen === "setup" || screen === "login") {
    return (
      <AuthPanel
        key={screen}
        onAuthenticated={handleAuthenticated}
        setupRequired={screen === "setup" && setupRequired}
      />
    );
  }

  return player ? <AuthenticatedApp player={player} onLogout={handleLogout} /> : null;
}

export default App;
