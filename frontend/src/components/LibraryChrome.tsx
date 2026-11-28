import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DevelopmentUserMenu } from "./DevelopmentUserMenu";
import { LibraryIcon, LibraryMark } from "./LibraryIcon";
import { ThemePicker } from "./ThemePicker";
import { Button } from "./ui";
import { Player } from "../types";

export type LibraryNavPage = "library" | "lets-play" | "logs" | "wishlist" | "wiki" | "ambience";

interface LibraryRailProps {
  player: Player;
  onLogout: () => void;
  children: ReactNode;
}

export function LibraryRail({ player, onLogout, children }: LibraryRailProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <aside className="library-rail">
      <Link className="brand-mark" to="/" aria-label="Board Game Library home">
        <LibraryMark className="brand-mark__symbol" />
        <span className="brand-mark__name">The Game<br />Library</span>
      </Link>
      <Button
        aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
        aria-controls="library-rail-navigation"
        aria-expanded={mobileMenuOpen}
        className="library-rail__menu-toggle"
        onClick={() => setMobileMenuOpen((open) => !open)}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d={mobileMenuOpen ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} />
        </svg>
      </Button>
      <div
        className={`library-rail__navigation${mobileMenuOpen ? " is-open" : ""}`}
        id="library-rail-navigation"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            setMobileMenuOpen(false);
          }
        }}
      >
        <div className="rail-divider" />
        {children}
        {import.meta.env.DEV && player.isAdmin && <DevelopmentUserMenu player={player} />}
      </div>
      <div className="rail-bottom">
        <span className="rail-bottom__avatar">{player.fullName.slice(0, 1).toUpperCase()}</span>
        <span className="rail-bottom__identity">
          <strong>{player.fullName}</strong>
          <small>Keeper of the collection</small>
        </span>
        <Button
          aria-label="Sign out"
          className="logout-button"
          onClick={onLogout}
          title="Sign out"
          type="button"
        >
          ↗<span className="logout-button__label">Sign out</span>
        </Button>
      </div>
    </aside>
  );
}

interface LibraryNavigationProps {
  activePage?: LibraryNavPage | undefined;
  backTo?: string;
  collectionNavigation?: ReactNode;
  collectionNavClassName?: string;
}

interface NavigationItem {
  key: Exclude<LibraryNavPage, "library">;
  label: string;
  icon: "play" | "chronicle" | "wishlist" | "wiki" | "ambience";
  to: string;
}

const gameNightItems: NavigationItem[] = [
  { key: "lets-play", label: "Let’s play", icon: "play", to: "/lets-play" },
  { key: "logs", label: "Game logs", icon: "chronicle", to: "/logs" },
  { key: "wishlist", label: "Wishlist", icon: "wishlist", to: "/wishlist" },
];

const referenceItems: NavigationItem[] = [
  { key: "wiki", label: "Game wiki", icon: "wiki", to: "/wiki" },
  { key: "ambience", label: "Ambience", icon: "ambience", to: "/ambience" },
];

function NavigationLink({
  item,
  activePage,
  dossier = false,
}: {
  item: NavigationItem;
  activePage?: LibraryNavPage | undefined;
  dossier?: boolean;
}) {
  const active = activePage === item.key;
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`shelf-nav__item${active ? " is-selected" : ""}${dossier ? " dossier-rail-link" : ""}`}
      to={item.to}
    >
      <span className="shelf-nav__glyph"><LibraryIcon name={item.icon} /></span>
      <span>{item.label}</span>
    </Link>
  );
}

export function LibraryNavigation({
  activePage,
  backTo,
  collectionNavigation,
  collectionNavClassName = "shelf-nav",
}: LibraryNavigationProps) {
  const dossier = backTo !== undefined;
  return (
    <>
      {collectionNavigation ?? (
        <>
          <span className="rail-label">Your collection</span>
          <nav className={collectionNavClassName} aria-label="Library navigation">
            <Link
              aria-current={activePage === "library" ? "page" : undefined}
              className={`shelf-nav__item${activePage === "library" ? " is-selected" : ""}${dossier ? " dossier-rail-link" : ""}`}
              to={backTo ?? "/"}
            >
              <span className="shelf-nav__glyph"><LibraryIcon name="collection" /></span>
              <span>{backTo ? "Back to the stacks" : "All games"}</span>
            </Link>
          </nav>
        </>
      )}
      <div className="rail-utility">
        <span className="rail-label">Game night</span>
        {gameNightItems.map((item) => (
          <NavigationLink key={item.key} activePage={activePage} dossier={dossier} item={item} />
        ))}
      </div>
      <div className="rail-utility">
        <span className="rail-label">Reference</span>
        {referenceItems.map((item) => (
          <NavigationLink key={item.key} activePage={activePage} dossier={dossier} item={item} />
        ))}
      </div>
    </>
  );
}

export function LibraryTopbar({ section, page }: { section: string; page: string }) {
  return (
    <header className="library-topbar">
      <div className="breadcrumbs"><span>{section}</span><b>/</b><strong>{page}</strong></div>
      <ThemePicker />
    </header>
  );
}
