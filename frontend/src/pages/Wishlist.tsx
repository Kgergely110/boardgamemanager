import { Bookmark, Flame, Heart, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DevelopmentUserMenu } from "../components/DevelopmentUserMenu";
import { LibraryIcon, LibraryMark } from "../components/LibraryIcon";
import { ThemePicker } from "../components/ThemePicker";
import { api, getErrorMessage } from "../lib/api";
import { Game, Player, Shelf, Tag, WishlistItem, WishlistPriority, WishlistStatus } from "../types";

type WishlistDraft = {
  title: string;
  maker: string;
  releaseYear: string;
  description: string;
  imageUrl: string;
  sourceUrl: string;
  minPlayers: string;
  maxPlayers: string;
  ageLimit: string;
  playTime: string;
  estimatedPrice: string;
  currency: string;
  notes: string;
  status: WishlistStatus;
  priority: WishlistPriority;
  tagIds: string[];
};

type WishlistPriceSummary = {
  pricedCount: number;
  pricesByCurrency: Array<{ currency: string; count: number; totalCents: string }>;
};

const MAX_ESTIMATED_PRICE_CENTS = 1_000_000_000_000;

const emptyDraft = (): WishlistDraft => ({
  title: "",
  maker: "",
  releaseYear: "",
  description: "",
  imageUrl: "",
  sourceUrl: "",
  minPlayers: "",
  maxPlayers: "",
  ageLimit: "",
  playTime: "",
  estimatedPrice: "",
  currency: "HUF",
  notes: "",
  status: "WANTED",
  priority: "NORMAL",
  tagIds: [],
});

type WishlistFilters = {
  q: string;
  status: string;
  tagId: string;
  players: string;
  maxPlayTime: string;
  maxAge: string;
  maxPrice: string;
  priority: string;
  sort: string;
};

const initialFilters: WishlistFilters = {
  q: "",
  status: "ACTIVE",
  tagId: "",
  players: "",
  maxPlayTime: "",
  maxAge: "",
  maxPrice: "",
  priority: "",
  sort: "priority",
};

function nullableNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function formatCents(value: number | string | bigint): string {
  const cents = BigInt(value);
  const absoluteCents = cents < 0n ? -cents : cents;
  const whole = (absoluteCents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = absoluteCents % 100n;
  const decimal = fraction === 0n ? "" : `.${fraction.toString().padStart(2, "0").replace(/0$/, "")}`;
  return `${cents < 0n ? "-" : ""}${whole}${decimal}`;
}

function formatPriceInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const decimalIndex = cleaned.indexOf(".");
  const whole = decimalIndex === -1 ? cleaned : cleaned.slice(0, decimalIndex);
  const fraction = decimalIndex === -1 ? null : cleaned.slice(decimalIndex + 1).replace(/\./g, "").slice(0, 2);
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction === null ? groupedWhole : `${groupedWhole}.${fraction}`;
}

function itemToDraft(item: WishlistItem): WishlistDraft {
  return {
    title: item.title,
    maker: item.maker ?? "",
    releaseYear: item.releaseYear?.toString() ?? "",
    description: item.description ?? "",
    imageUrl: item.imageUrl ?? "",
    sourceUrl: item.sourceUrl ?? "",
    minPlayers: item.minPlayers?.toString() ?? "",
    maxPlayers: item.maxPlayers?.toString() ?? "",
    ageLimit: item.ageLimit?.toString() ?? "",
    playTime: item.playTime?.toString() ?? "",
    estimatedPrice: item.estimatedPriceCents === null ? "" : formatCents(item.estimatedPriceCents),
    currency: item.currency ?? "HUF",
    notes: item.notes ?? "",
    status: item.status,
    priority: item.priority,
    tagIds: item.tags.map((tag) => tag.id),
  };
}

function statusLabel(status: WishlistStatus): string {
  return {
    CONSIDERING: "Considering",
    WANTED: "Wanted",
    ORDERED: "On its way",
    ACQUIRED: "Collected",
    ARCHIVED: "Set aside",
  }[status];
}

function priorityLabel(priority: WishlistPriority): string {
  return priority === "NORMAL" ? "Medium" : priority === "HIGH" ? "High" : "Low";
}

function formatPrice(item: WishlistItem): string | null {
  if (item.estimatedPriceCents === null) return null;
  return `${formatCents(item.estimatedPriceCents)} ${item.currency ?? "HUF"}`;
}

function WishlistPriorityMark({ priority }: { priority: WishlistPriority }) {
  const Icon = priority === "HIGH" ? Flame : priority === "NORMAL" ? Sparkles : Bookmark;
  return (
    <span className="wishlist-priority">
      <Icon aria-hidden="true" />
      <span>{priorityLabel(priority)} priority</span>
    </span>
  );
}

export function Wishlist({ player, onLogout }: { player: Player; onLogout: () => void }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [filters, setFilters] = useState<WishlistFilters>(initialFilters);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [priceSummary, setPriceSummary] = useState<WishlistPriceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);
  const [draft, setDraft] = useState<WishlistDraft | null>(null);
  const [deletingItem, setDeletingItem] = useState<WishlistItem | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [acquiringItem, setAcquiringItem] = useState<WishlistItem | null>(null);
  const [acquireShelfId, setAcquireShelfId] = useState("");
  const [acquireShelfNumber, setAcquireShelfNumber] = useState("1");
  const [acquireMaker, setAcquireMaker] = useState("");
  const [acquireSaving, setAcquireSaving] = useState(false);
  const [acquireError, setAcquireError] = useState("");
  const [interestSavingIds, setInterestSavingIds] = useState<Set<string>>(() => new Set());
  const estimatedPriceInputRef = useRef<HTMLInputElement>(null);
  const priceInputCursorIndex = useRef<number | null>(null);
  const wishlistQueryKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const rawIndex = priceInputCursorIndex.current;
    const input = estimatedPriceInputRef.current;
    if (rawIndex === null || !input) return;
    let position = 0;
    let characters = 0;
    while (position < input.value.length && characters < rawIndex) {
      if (input.value[position] !== " ") characters += 1;
      position += 1;
    }
    input.setSelectionRange(position, position);
    priceInputCursorIndex.current = null;
  }, [draft?.estimatedPrice]);

  useEffect(() => {
    let active = true;
    async function load() {
      const queryKey = JSON.stringify({ filters, page });
      const queryChanged = wishlistQueryKeyRef.current !== queryKey;
      wishlistQueryKeyRef.current = queryKey;
      if (queryChanged) {
        setLoading(true);
        setPriceSummary(null);
      }
      setError("");
      const params = new URLSearchParams({ page: page.toString(), pageSize: "24", sort: filters.sort });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status) params.set("status", filters.status);
      if (filters.tagId) params.set("tagId", filters.tagId);
      if (filters.players) params.set("players", filters.players);
      if (filters.maxPlayTime) params.set("maxPlayTime", filters.maxPlayTime);
      if (filters.maxAge) params.set("maxAge", filters.maxAge);
      if (filters.maxPrice) params.set("maxPriceCents", String(Math.round(Number(filters.maxPrice) * 100)));
      if (filters.priority) params.set("priority", filters.priority);
      try {
        const [wishlistResponse, tagsResponse, shelvesResponse] = await Promise.all([
          api.get<{
            data: WishlistItem[];
            pagination: { total: number; totalPages: number };
            summary: WishlistPriceSummary;
          }>(`/wishlist?${params}`),
          api.get<{ data: Tag[] }>("/tags"),
          api.get<{ data: Shelf[] }>("/shelves"),
        ]);
        if (active) {
          setItems(wishlistResponse.data.data);
          setTotal(wishlistResponse.data.pagination.total);
          setPageCount(wishlistResponse.data.pagination.totalPages);
          setPriceSummary(wishlistResponse.data.summary);
          setTags(tagsResponse.data.data);
          setShelves(shelvesResponse.data.data);
        }
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [filters, page, revision]);

  useEffect(() => {
    if (!draft && !acquiringItem && !deletingItem) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving && !acquireSaving && !deleteSaving) {
        setDraft(null);
        setEditingItem(null);
        setAcquiringItem(null);
        setDeletingItem(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [draft, acquiringItem, deletingItem, saving, acquireSaving, deleteSaving]);

  function changeFilter(field: keyof WishlistFilters, value: string) {
    setPage(1);
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function openCreateForm() {
    setEditingItem(null);
    setDraft(emptyDraft());
    setFormError("");
  }

  function openEditForm(item: WishlistItem) {
    setEditingItem(item);
    setDraft(itemToDraft(item));
    setFormError("");
  }

  function updateDraft(field: keyof WishlistDraft, value: string | string[]) {
    setDraft((current) => current && ({ ...current, [field]: value }));
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setFormError("");
    const normalizedPrice = draft.estimatedPrice.replace(/\s/g, "");
    if (normalizedPrice && !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(normalizedPrice)) {
      setFormError("Enter a valid price with up to two decimal places.");
      return;
    }
    const price = normalizedPrice ? Number(normalizedPrice) : null;
    if (price !== null && (!Number.isFinite(price) || price * 100 > MAX_ESTIMATED_PRICE_CENTS)) {
      setFormError("The estimated price is too large.");
      return;
    }
    setSaving(true);
    const body = {
      title: draft.title,
      maker: draft.maker.trim() || null,
      releaseYear: nullableNumber(draft.releaseYear),
      description: draft.description.trim() || null,
      imageUrl: draft.imageUrl.trim() || null,
      sourceUrl: draft.sourceUrl.trim() || null,
      minPlayers: nullableNumber(draft.minPlayers),
      maxPlayers: nullableNumber(draft.maxPlayers),
      ageLimit: nullableNumber(draft.ageLimit),
      playTime: nullableNumber(draft.playTime),
      estimatedPriceCents: price === null ? null : Math.round(price * 100),
      currency: price === null ? null : draft.currency,
      notes: draft.notes.trim() || null,
      ...(!editingItem || editingItem.status !== "ACQUIRED" ? { status: draft.status } : {}),
      priority: draft.priority,
      tagIds: draft.tagIds,
    };
    try {
      if (editingItem) {
        await api.patch(`/wishlist/${editingItem.id}`, body);
        setNotice(`“${draft.title}” has been updated.`);
      } else {
        await api.post("/wishlist", body);
        setNotice(`“${draft.title}” has been added to the shared list.`);
      }
      setDraft(null);
      setEditingItem(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setFormError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function toggleInterest(item: WishlistItem) {
    if (interestSavingIds.has(item.id)) return;
    setError("");
    const wasInterested = item.isInterested;
    const nextInterested = !wasInterested;
    const countChange = nextInterested ? 1 : -1;
    setInterestSavingIds((current) => new Set(current).add(item.id));
    setItems((current) => current.map((currentItem) => currentItem.id === item.id
      ? {
          ...currentItem,
          isInterested: nextInterested,
          interestCount: Math.max(0, currentItem.interestCount + countChange),
        }
      : currentItem));
    try {
      if (wasInterested) await api.delete(`/wishlist/${item.id}/interests/me`);
      else await api.put(`/wishlist/${item.id}/interests/me`);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setItems((current) => current.map((currentItem) => currentItem.id === item.id
        ? {
            ...currentItem,
            isInterested: wasInterested,
            interestCount: Math.max(0, currentItem.interestCount - countChange),
          }
        : currentItem));
      setError(getErrorMessage(requestError));
    } finally {
      setInterestSavingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function archiveItem(item: WishlistItem) {
    setError("");
    try {
      await api.patch(`/wishlist/${item.id}`, { status: "ARCHIVED" });
      setNotice(`“${item.title}” has been moved to the archive.`);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function deleteItem() {
    if (!deletingItem) return;
    setDeleteSaving(true);
    setError("");
    try {
      await api.delete(`/wishlist/${deletingItem.id}`);
      setNotice(`“${deletingItem.title}” has been permanently removed.`);
      setDeletingItem(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setDeletingItem(null);
    } finally {
      setDeleteSaving(false);
    }
  }

  function beginAcquisition(item: WishlistItem) {
    setAcquiringItem(item);
    setAcquireMaker(item.maker ?? "");
    setAcquireShelfId(shelves[0]?.id ?? "");
    setAcquireShelfNumber("1");
    setAcquireError("");
  }

  async function addToCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acquiringItem) return;
    setAcquireSaving(true);
    setAcquireError("");
    try {
      await api.post<{ data: Game }>("/games", {
        name: acquiringItem.title,
        maker: acquireMaker.trim(),
        ...(acquiringItem.releaseYear === null ? {} : { releaseYear: acquiringItem.releaseYear }),
        ...(acquiringItem.minPlayers === null ? {} : { minPlayers: acquiringItem.minPlayers }),
        ...(acquiringItem.maxPlayers === null ? {} : { maxPlayers: acquiringItem.maxPlayers }),
        ...(acquiringItem.ageLimit === null ? {} : { ageLimit: acquiringItem.ageLimit }),
        ...(acquiringItem.playTime === null ? {} : { playTime: acquiringItem.playTime }),
        ...(acquiringItem.imageUrl ? { imageUrl: acquiringItem.imageUrl } : {}),
        shelfId: acquireShelfId,
        shelfNumber: Number(acquireShelfNumber),
        orientation: "vertical",
        wishlistItemId: acquiringItem.id,
      });
      setNotice(`“${acquiringItem.title}” has joined the collection. Its tags and wishlist history have been kept.`);
      setAcquiringItem(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setAcquireError(getErrorMessage(requestError));
    } finally {
      setAcquireSaving(false);
    }
  }

  const selectedShelf = shelves.find((shelf) => shelf.id === acquireShelfId);

  return (
    <div className="library-shell wishlist-shell">
      <aside className="library-rail">
        <Link className="brand-mark" to="/" aria-label="Board Game Library home">
          <LibraryMark className="brand-mark__symbol" />
          <span className="brand-mark__name">The Game<br />Library</span>
        </Link>
        <div className="rail-divider" />
        <span className="rail-label">YOUR COLLECTION</span>
        <nav className="shelf-nav" aria-label="Library navigation">
          <Link className="shelf-nav__item" to="/">
            <span className="shelf-nav__glyph"><LibraryIcon name="collection" /></span><span>All games</span>
          </Link>
        </nav>
        <div className="rail-utility">
          <span className="rail-label">GAME NIGHT</span>
          <Link className="shelf-nav__item" to="/lets-play">
            <span className="shelf-nav__glyph"><LibraryIcon name="play" /></span><span>Let’s play</span>
          </Link>
          <Link className="shelf-nav__item" to="/logs">
            <span className="shelf-nav__glyph"><LibraryIcon name="chronicle" /></span><span>Game logs</span>
          </Link>
          <Link className="shelf-nav__item is-selected" to="/wishlist" aria-current="page">
            <span className="shelf-nav__glyph"><LibraryIcon name="wishlist" /></span><span>Wishlist</span>
          </Link>
        </div>
        <div className="rail-utility">
          <span className="rail-label">REFERENCE</span>
          <Link className="shelf-nav__item" to="/wiki">
            <span className="shelf-nav__glyph"><LibraryIcon name="wiki" /></span><span>Game wiki</span>
          </Link>
          <Link className="shelf-nav__item" to="/ambience">
            <span className="shelf-nav__glyph"><LibraryIcon name="ambience" /></span><span>Ambience</span>
          </Link>
        </div>
        {import.meta.env.DEV && player.isAdmin && <DevelopmentUserMenu player={player} />}
        <div className="rail-bottom">
          <span className="rail-bottom__avatar">{player.fullName.slice(0, 1).toUpperCase()}</span>
          <span className="rail-bottom__identity"><strong>{player.fullName}</strong><small>Keeper of the collection</small></span>
          <button className="logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out">↗</button>
        </div>
      </aside>

      <main className="library-main wishlist-main">
        <header className="library-topbar">
          <div className="breadcrumbs"><span>GAME NIGHT</span><b>/</b><strong>WISHLIST</strong></div>
          <ThemePicker />
        </header>
        <section className="wishlist-heading">
          <div>
            <span className="eyebrow">THE SHARED WANT LIST</span>
            <h1>Games to bring home</h1>
            <p>A place for the games you’re curious about, saving for, or already on their way.</p>
          </div>
          <button className="button button--primary" onClick={openCreateForm}>
            <LibraryIcon name="wishlist" /> Add a game
          </button>
        </section>

        {notice && <p className="wishlist-notice" role="status">{notice}</p>}
        {error && <p className="wishlist-error" role="alert">{error}</p>}

        <section className="wishlist-filters" aria-label="Filter wishlist">
          <label className="wishlist-field wishlist-search">
            <span>Search title, maker or #tag</span>
            <input value={filters.q} onChange={(event) => changeFilter("q", event.target.value)} placeholder="Try “campaign” or #family" />
          </label>
          <label className="wishlist-field">
            <span>List</span>
            <select value={filters.status} onChange={(event) => changeFilter("status", event.target.value)}>
              <option value="ACTIVE">Active wishlist</option>
              <option value="CONSIDERING">Considering</option>
              <option value="WANTED">Wanted</option>
              <option value="ORDERED">Ordered</option>
              <option value="ACQUIRED">In the collection</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label className="wishlist-field">
            <span>Tag</span>
            <select value={filters.tagId} onChange={(event) => changeFilter("tagId", event.target.value)}>
              <option value="">All tags</option>
              {tags.map((tag) => <option key={tag.id} value={tag.id}>#{tag.name}</option>)}
            </select>
          </label>
          <label className="wishlist-field">
            <span>Players</span>
            <input type="number" min="1" max="100" value={filters.players} onChange={(event) => changeFilter("players", event.target.value)} placeholder="Any" />
          </label>
          <label className="wishlist-field">
            <span>Up to (minutes)</span>
            <input type="number" min="1" max="10000" value={filters.maxPlayTime} onChange={(event) => changeFilter("maxPlayTime", event.target.value)} placeholder="Any" />
          </label>
          <label className="wishlist-field">
            <span>Up to (age)</span>
            <input type="number" min="0" max="100" value={filters.maxAge} onChange={(event) => changeFilter("maxAge", event.target.value)} placeholder="Any" />
          </label>
          <label className="wishlist-field">
            <span>Up to (price)</span>
            <input type="number" min="0" step="0.01" value={filters.maxPrice} onChange={(event) => changeFilter("maxPrice", event.target.value)} placeholder="Any" />
          </label>
          <label className="wishlist-field">
            <span>Priority</span>
            <select value={filters.priority} onChange={(event) => changeFilter("priority", event.target.value)}>
              <option value="">All priorities</option>
              <option value="HIGH">High</option>
              <option value="NORMAL">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>
          <label className="wishlist-field">
            <span>Order by</span>
            <select value={filters.sort} onChange={(event) => changeFilter("sort", event.target.value)}>
              <option value="priority">Priority</option>
              <option value="recent">Recently added</option>
              <option value="title">Title</option>
              <option value="interest">Shared interest</option>
            </select>
          </label>
        </section>

        <div className="wishlist-results-heading">
          <span>{total} {total === 1 ? "game" : "games"}{filters.status === "ACTIVE" ? " in the active wishlist" : ""}</span>
          <span>Shared by everyone in the household</span>
        </div>
        {!loading && priceSummary && (
          <section className="wishlist-summary" aria-label="Summary of currently filtered wishlist games">
            <div className="wishlist-summary__count">
              <span>Games in this view</span>
              <strong>{total}</strong>
            </div>
            <div className="wishlist-summary__count">
              <span>With a listed price</span>
              <strong>{priceSummary.pricedCount}</strong>
            </div>
            {priceSummary.pricesByCurrency.length ? priceSummary.pricesByCurrency.map((group) => {
              const averageCents = (BigInt(group.totalCents) + BigInt(group.count) / 2n) / BigInt(group.count);
              return (
                <div className="wishlist-summary__currency" key={group.currency}>
                  <span>Total estimated · {group.currency}</span>
                  <strong>{formatCents(group.totalCents)} <small>{group.currency}</small></strong>
                  <span className="wishlist-summary__average">
                    Average {formatCents(averageCents)} {group.currency} across {group.count} {group.count === 1 ? "game" : "games"}
                  </span>
                </div>
              );
            }) : (
              <div className="wishlist-summary__empty">No prices listed for these games yet.</div>
            )}
          </section>
        )}
        {loading ? (
          <div className="wishlist-empty" role="status">Opening the list…</div>
        ) : items.length ? (
          <section className="wishlist-cards" aria-label="Wishlist games">
            {items.map((item) => (
              <article className={`wishlist-card wishlist-card--${item.priority.toLowerCase()}`} key={item.id}>
                <div className="wishlist-card__art">
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt="" loading="lazy" />
                    : <div className="wishlist-card__placeholder"><LibraryIcon name="wishlist" /></div>}
                </div>
                <span className={`wishlist-card__status wishlist-card__status--${item.status.toLowerCase()}`}>
                  {statusLabel(item.status)}
                </span>
                <div className="wishlist-card__body">
                  <div className="wishlist-card__title-row">
                    <div>
                      <WishlistPriorityMark priority={item.priority} />
                      <h2>{item.title}</h2>
                      <p className="wishlist-card__maker">{[item.maker, item.releaseYear].filter(Boolean).join(" · ") || "Maker not recorded"}</p>
                    </div>
                    {item.status === "ACQUIRED" && item.game && <Link className="wishlist-game-link" to={`/games/${item.game.id}`}>Open game</Link>}
                  </div>
                  {item.description && <p className="wishlist-card__description">{item.description}</p>}
                  {formatPrice(item) && (
                    <div className="wishlist-card__price">
                      <span>Estimated price</span>
                      <strong>{formatPrice(item)}</strong>
                    </div>
                  )}
                  <div className="wishlist-card__facts">
                    {item.minPlayers !== null && item.maxPlayers !== null && <span>{item.minPlayers}–{item.maxPlayers} players</span>}
                    {item.playTime !== null && <span>{item.playTime} min</span>}
                    {item.ageLimit !== null && <span>Ages {item.ageLimit}+</span>}
                  </div>
                  {item.tags.length > 0 && (
                    <div className="wishlist-card__tags">
                      {item.tags.map((tag) => <span className="wishlist-tag" key={tag.id}>#{tag.name}</span>)}
                    </div>
                  )}
                  {item.notes && <details className="wishlist-card__notes"><summary>Household notes</summary><p>{item.notes}</p></details>}
                  <div className="wishlist-card__meta">
                    <span>Added by {item.addedBy.fullName}</span>
                    <span>{item.interestCount} {item.interestCount === 1 ? "person is" : "people are"} interested</span>
                  </div>
                  <div className="wishlist-card__actions">
                    {item.status !== "ACQUIRED" && item.status !== "ARCHIVED" && (
                      <button
                        aria-busy={interestSavingIds.has(item.id)}
                        aria-pressed={item.isInterested}
                        className={`button wishlist-interest-button${item.isInterested ? " wishlist-interest-button--selected" : ""}`}
                        disabled={interestSavingIds.has(item.id)}
                        onClick={() => void toggleInterest(item)}
                        type="button"
                      >
                        <Heart aria-hidden="true" fill={item.isInterested ? "currentColor" : "none"} />
                        {item.isInterested ? "Interested" : "I’m interested"}
                      </button>
                    )}
                    {item.status !== "ACQUIRED" && item.status !== "ARCHIVED" && (
                      <button className="button button--quiet" onClick={() => beginAcquisition(item)}>Add to collection</button>
                    )}
                    <button className="wishlist-text-button" onClick={() => openEditForm(item)}>Edit</button>
                    {item.status !== "ACQUIRED" && item.status !== "ARCHIVED" && (
                      <button className="wishlist-text-button wishlist-text-button--archive" onClick={() => void archiveItem(item)}>Archive</button>
                    )}
                    {item.status === "ARCHIVED" && (
                      <button className="wishlist-text-button wishlist-text-button--archive" onClick={() => setDeletingItem(item)}>Delete permanently</button>
                    )}
                    {item.sourceUrl && <a className="wishlist-text-button" href={item.sourceUrl} target="_blank" rel="noreferrer">Visit source</a>}
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="wishlist-empty">
            <span className="eyebrow">A QUIET SHELF</span>
            <h2>{filters.status === "ACTIVE" ? "No games match this list yet." : "Nothing here just yet."}</h2>
            <p>Try changing a filter, or add a game the household might enjoy.</p>
            <button className="button button--primary" onClick={openCreateForm}>Add a game</button>
          </div>
        )}

        {pageCount > 1 && (
          <nav className="wishlist-pagination" aria-label="Wishlist pages">
            <button className="button button--quiet" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button className="button button--quiet" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
          </nav>
        )}
      </main>

      {draft && (
        <div className="wishlist-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) { setDraft(null); setEditingItem(null); }
        }}>
          <form className="wishlist-editor" role="dialog" aria-modal="true" onSubmit={(event) => void saveItem(event)} aria-labelledby="wishlist-editor-title">
            <div className="wishlist-editor__heading">
              <div>
                <span className="eyebrow">{editingItem ? "UPDATE THE LIST" : "A NEW POSSIBILITY"}</span>
                <h2 id="wishlist-editor-title">{editingItem ? "Edit wishlist game" : "Add a game to the wishlist"}</h2>
                <p>An asterisk marks required fields; all other details are optional. Everyone can see this shared list.</p>
              </div>
              <button className="wishlist-close" type="button" aria-label="Close form" disabled={saving} onClick={() => { setDraft(null); setEditingItem(null); }}>×</button>
            </div>
            <div className="wishlist-editor__fields">
              <label className="wishlist-field"><span className="field-label">Game title</span><input required maxLength={120} value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} /></label>
              <label className="wishlist-field"><span>Maker</span><input maxLength={120} value={draft.maker} onChange={(event) => updateDraft("maker", event.target.value)} /></label>
              <label className="wishlist-field"><span>Release year</span><input type="number" min="1800" max="2200" value={draft.releaseYear} onChange={(event) => updateDraft("releaseYear", event.target.value)} /></label>
              <label className="wishlist-field"><span>Status</span><select disabled={editingItem?.status === "ACQUIRED"} value={draft.status} onChange={(event) => updateDraft("status", event.target.value)}>{editingItem?.status === "ACQUIRED" && <option value="ACQUIRED">In the collection</option>}<option value="CONSIDERING">Considering</option><option value="WANTED">Wanted</option><option value="ORDERED">Ordered</option>{editingItem?.status === "ARCHIVED" && <option value="ARCHIVED">Archived</option>}</select></label>
              <label className="wishlist-field"><span>Priority</span><select value={draft.priority} onChange={(event) => updateDraft("priority", event.target.value)}><option value="HIGH">High</option><option value="NORMAL">Medium</option><option value="LOW">Low</option></select></label>
              <label className="wishlist-field"><span>Minimum players</span><input type="number" min="1" max="100" value={draft.minPlayers} onChange={(event) => updateDraft("minPlayers", event.target.value)} /></label>
              <label className="wishlist-field"><span>Maximum players</span><input type="number" min="1" max="100" value={draft.maxPlayers} onChange={(event) => updateDraft("maxPlayers", event.target.value)} /></label>
              <label className="wishlist-field"><span>Age limit</span><input type="number" min="0" max="100" value={draft.ageLimit} onChange={(event) => updateDraft("ageLimit", event.target.value)} /></label>
              <label className="wishlist-field"><span>Play time (minutes)</span><input type="number" min="1" max="10000" value={draft.playTime} onChange={(event) => updateDraft("playTime", event.target.value)} /></label>
              <label className="wishlist-field"><span>Estimated price</span><input ref={estimatedPriceInputRef} type="text" inputMode="decimal" autoComplete="off" maxLength={16} value={draft.estimatedPrice} onChange={(event) => {
                const value = event.currentTarget.value;
                const cursor = event.currentTarget.selectionStart ?? value.length;
                const formatted = formatPriceInput(value);
                priceInputCursorIndex.current = formatted === draft.estimatedPrice
                  ? null
                  : value.slice(0, cursor).replace(/[^0-9.]/g, "").length;
                updateDraft("estimatedPrice", formatted);
              }} /></label>
              <label className="wishlist-field"><span>Currency</span><select value={draft.currency} onChange={(event) => updateDraft("currency", event.target.value)}><option value="HUF">HUF</option><option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="CAD">CAD</option><option value="AUD">AUD</option></select></label>
              <label className="wishlist-field"><span>Image URL</span><input type="url" maxLength={2048} value={draft.imageUrl} onChange={(event) => updateDraft("imageUrl", event.target.value)} /></label>
              <label className="wishlist-field"><span>Shop or reference URL</span><input type="url" maxLength={2048} value={draft.sourceUrl} onChange={(event) => updateDraft("sourceUrl", event.target.value)} /></label>
              <label className="wishlist-field wishlist-field--wide"><span>Short description</span><textarea maxLength={2000} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} /></label>
              <label className="wishlist-field wishlist-field--wide"><span>Household notes</span><textarea maxLength={4000} value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} /></label>
            </div>
            <fieldset className="wishlist-tag-picker">
              <legend>Tags</legend>
              <div>
                {tags.length ? tags.map((tag) => (
                  <label className="wishlist-tag-option" key={tag.id}>
                    <input type="checkbox" checked={draft.tagIds.includes(tag.id)} disabled={!draft.tagIds.includes(tag.id) && draft.tagIds.length >= 30} onChange={() => updateDraft("tagIds", draft.tagIds.includes(tag.id) ? draft.tagIds.filter((id) => id !== tag.id) : [...draft.tagIds, tag.id])} />
                    <span>#{tag.name}</span>
                  </label>
                )) : <p>No tags yet. Add them from the collection.</p>}
              </div>
            </fieldset>
            {formError && <p className="wishlist-error" role="alert">{formError}</p>}
            <div className="wishlist-editor__footer">
              <button className="button button--quiet" type="button" disabled={saving} onClick={() => { setDraft(null); setEditingItem(null); }}>Cancel</button>
              <button className="button button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : editingItem ? "Save changes" : "Add to wishlist"}</button>
            </div>
          </form>
        </div>
      )}

      {deletingItem && (
        <div className="wishlist-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !deleteSaving) setDeletingItem(null);
        }}>
          <section className="wishlist-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="wishlist-delete-title">
            <span className="eyebrow">PERMANENT REMOVAL</span>
            <h2 id="wishlist-delete-title">Remove “{deletingItem.title}” for good?</h2>
            <p>This archived wishlist entry and its interest records will be deleted. Games already in the collection are protected from removal here.</p>
            {error && <p className="wishlist-error" role="alert">{error}</p>}
            <div className="wishlist-editor__footer">
              <button className="button button--quiet" disabled={deleteSaving} onClick={() => setDeletingItem(null)}>Keep archived</button>
              <button className="button button--danger" disabled={deleteSaving} onClick={() => void deleteItem()}>{deleteSaving ? "Removing…" : "Delete permanently"}</button>
            </div>
          </section>
        </div>
      )}

      {acquiringItem && (
        <div className="wishlist-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !acquireSaving) setAcquiringItem(null);
        }}>
          <form className="wishlist-editor wishlist-acquire" role="dialog" aria-modal="true" onSubmit={(event) => void addToCollection(event)} aria-labelledby="wishlist-acquire-title">
            <div className="wishlist-editor__heading">
              <div>
                <span className="eyebrow">A PLACE ON THE SHELF</span>
                <h2 id="wishlist-acquire-title">Add “{acquiringItem.title}” to the collection</h2>
                <p>This creates the game entry, transfers its tags, and marks the wishlist item as acquired.</p>
              </div>
              <button className="wishlist-close" type="button" aria-label="Close form" disabled={acquireSaving} onClick={() => setAcquiringItem(null)}>×</button>
            </div>
            <div className="wishlist-editor__fields">
              <label className="wishlist-field wishlist-field--wide"><span className="field-label">Maker</span><input required maxLength={120} value={acquireMaker} onChange={(event) => setAcquireMaker(event.target.value)} /></label>
              <label className="wishlist-field"><span className="field-label">Container</span>
                <select required value={acquireShelfId} onChange={(event) => { setAcquireShelfId(event.target.value); setAcquireShelfNumber("1"); }}>
                  <option value="">Choose a container</option>
                  {shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}
                </select>
              </label>
              <label className="wishlist-field"><span className="field-label">Shelf / level</span>
                <select required disabled={!selectedShelf} value={acquireShelfNumber} onChange={(event) => setAcquireShelfNumber(event.target.value)}>
                  {Array.from({ length: selectedShelf?.shelfCount ?? 0 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                </select>
              </label>
            </div>
            {!shelves.length && <p className="wishlist-error">Add a container before placing a game in the collection. <Link to="/">Go to the library</Link>.</p>}
            {acquireError && <p className="wishlist-error" role="alert">{acquireError}</p>}
            <div className="wishlist-editor__footer">
              <button className="button button--quiet" type="button" disabled={acquireSaving} onClick={() => setAcquiringItem(null)}>Cancel</button>
              <button className="button button--primary" type="submit" disabled={acquireSaving || !shelves.length}>{acquireSaving ? "Adding…" : "Add to collection"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
