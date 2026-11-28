import { Button, ButtonLink, ConfirmationDialog, Eyebrow, FeedbackMessage } from "../components/ui";
import { LibraryNavigation, LibraryRail, LibraryTopbar } from "../components/LibraryChrome";
import { FormEvent, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useLocation, useParams } from "react-router-dom";
import { LibraryIcon } from "../components/LibraryIcon";
import { PlayLogCard } from "../components/PlayLogCard";
import { api, getErrorMessage } from "../lib/api";
import {
  GameAward,
  GameDetails as GameDetailsRecord,
  GameDocument,
  GameRating,
  GameReviews,
  PlayLog,
  Player,
  Tag,
} from "../types";

interface GameDetailsProps {
  player: Player;
  onLogout: () => void;
}

type DocumentEditor = { mode: "new" } | { mode: "edit"; document: GameDocument };
type PendingRemoval =
  | { kind: "rating" }
  | { kind: "award"; award: GameAward }
  | { kind: "tag"; tag: Tag };

interface RatingDraft {
  overall: number;
  luckFactor: string;
  strategyDepth: string;
  socialDeduction: string;
  logicalDeduction: string;
  playerInteraction: string;
  complexity: string;
  comment: string;
}

interface AwardDraft {
  name: string;
  category: string;
  year: string;
}

const ratingDimensions = [
  { key: "luckFactor", label: "Luck factor", guide: "Skill-led → luck-driven" },
  { key: "strategyDepth", label: "Strategy depth", guide: "Tactical → long-term planning" },
  { key: "socialDeduction", label: "Social deduction", guide: "None → central mechanic" },
  { key: "logicalDeduction", label: "Logical deduction", guide: "None → central mechanic" },
  { key: "playerInteraction", label: "Player interaction", guide: "Solitary → highly interactive" },
  { key: "complexity", label: "Complexity", guide: "Easy to teach → rules-heavy" },
] as const;

function emptyRatingDraft(rating: GameRating | null = null): RatingDraft {
  return {
    overall: rating?.overall ?? 0,
    luckFactor: rating?.luckFactor?.toString() ?? "",
    strategyDepth: rating?.strategyDepth?.toString() ?? "",
    socialDeduction: rating?.socialDeduction?.toString() ?? "",
    logicalDeduction: rating?.logicalDeduction?.toString() ?? "",
    playerInteraction: rating?.playerInteraction?.toString() ?? "",
    complexity: rating?.complexity?.toString() ?? "",
    comment: rating?.comment ?? "",
  };
}

function ratingStars(value: number): string {
  return `${"★".repeat(value)}${"☆".repeat(5 - value)}`;
}

function playerCount(game: GameDetailsRecord): string {
  if (game.minPlayers && game.maxPlayers) return `${game.minPlayers}–${game.maxPlayers}`;
  if (game.minPlayers) return `${game.minPlayers}+`;
  if (game.maxPlayers) return `Up to ${game.maxPlayers}`;
  return "Not listed";
}

function isRulesDocument(document: GameDocument): boolean {
  return document.title.toLocaleLowerCase() === "rules";
}

const tagPalettes = [
  { backgroundColor: "#e5eadf", borderColor: "#c3cfb9", color: "#43553e" },
  { backgroundColor: "#f0e5d7", borderColor: "#dac4a7", color: "#765237" },
  { backgroundColor: "#e3e7ed", borderColor: "#c0c8d6", color: "#4b5870" },
  { backgroundColor: "#f0e1dd", borderColor: "#d8b8b0", color: "#82483c" },
  { backgroundColor: "#e9e5d5", borderColor: "#d0c59d", color: "#6d613d" },
];

function tagStyle(name: string) {
  let hash = 0;
  for (const character of name.toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return tagPalettes[hash % tagPalettes.length];
}

export function GameDetails({ player, onLogout }: GameDetailsProps) {
  const { gameId } = useParams();
  const location = useLocation();
  const backTo = typeof location.state?.from === "string" ? location.state.from : "/";
  const [game, setGame] = useState<GameDetailsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagsLoadError, setTagsLoadError] = useState("");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState("");
  const [tagNotice, setTagNotice] = useState("");
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionError, setDescriptionError] = useState("");
  const [descriptionNotice, setDescriptionNotice] = useState("");
  const [documentEditor, setDocumentEditor] = useState<DocumentEditor | null>(null);
  const [documentTitleDraft, setDocumentTitleDraft] = useState("");
  const [documentContentDraft, setDocumentContentDraft] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [documentNotice, setDocumentNotice] = useState("");
  const [openDocumentIds, setOpenDocumentIds] = useState<Set<string>>(() => new Set());
  const [pendingDocumentDelete, setPendingDocumentDelete] = useState<GameDocument | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [playLogs, setPlayLogs] = useState<PlayLog[]>([]);
  const [playLogsPage, setPlayLogsPage] = useState(1);
  const [playLogsTotal, setPlayLogsTotal] = useState(0);
  const [playLogsTotalPages, setPlayLogsTotalPages] = useState(0);
  const [playLogsLoading, setPlayLogsLoading] = useState(true);
  const [playLogsError, setPlayLogsError] = useState("");
  const [playLogsRevision, setPlayLogsRevision] = useState(0);
  const [gameReviews, setGameReviews] = useState<GameReviews | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewsLoadError, setReviewsLoadError] = useState("");
  const [reviewsNotice, setReviewsNotice] = useState("");
  const [reviewsRevision, setReviewsRevision] = useState(0);
  const [ratingDraft, setRatingDraft] = useState<RatingDraft>(() => emptyRatingDraft());
  const [ratingBusy, setRatingBusy] = useState(false);
  const [activeDossierSection, setActiveDossierSection] = useState("overview");
  const [awardDraft, setAwardDraft] = useState<AwardDraft>({ name: "", category: "", year: "" });
  const [awardBusyId, setAwardBusyId] = useState("");
  const [awardSaving, setAwardSaving] = useState(false);

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(".dossier-main .dossier-section[id]"),
    );
    if (sections.length === 0) return;

    let frame = 0;
    let updateScheduled = false;
    const updateActiveSection = () => {
      if (updateScheduled) return;
      updateScheduled = true;
      frame = window.requestAnimationFrame(() => {
        updateScheduled = false;
        const atPageBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        const marker = window.innerHeight * 0.3;
        const firstSection = sections[0];
        if (!firstSection) return;
        let currentSection = firstSection;
        for (const section of sections) {
          if (section.getBoundingClientRect().top > marker) break;
          currentSection = section;
        }
        const lastSection = sections[sections.length - 1];
        if (atPageBottom && lastSection) currentSection = lastSection;
        setActiveDossierSection((current) => current === currentSection.id ? current : currentSection.id);
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [game?.id]);

  useEffect(() => {
    const currentGame = game?.id === gameId ? game : null;
    document.title = currentGame
      ? `${currentGame.name} | Game Dossier`
      : "Game Dossier | The Game Library";
  }, [game, gameId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setLoadFailed(false);
    setTagsLoadError("");
    setTagError("");
    setTagNotice("");
    setSelectedTagId("");
    setNewTagName("");
    setDescriptionEditing(false);
    setDescriptionError("");
    setDescriptionNotice("");
    setReviewsNotice("");
    setDocumentEditor(null);
    setDocumentError("");
    setDocumentNotice("");
    setOpenDocumentIds(new Set());
    setPendingDocumentDelete(null);
    setPlayLogsPage(1);
    api.get<{ data: GameDetailsRecord }>(`/games/${gameId}`)
      .then(({ data }) => {
        if (active) {
          setGame(data.data);
          setLoadFailed(false);
          setDescriptionDraft(data.data.description ?? "");
          const firstRules = data.data.documents.find(isRulesDocument);
          setOpenDocumentIds(firstRules ? new Set([firstRules.id]) : new Set());
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getErrorMessage(requestError));
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    api.get<{ data: Tag[] }>("/tags")
      .then(({ data }) => {
        if (active) setAvailableTags(data.data);
      })
      .catch((requestError: unknown) => {
        if (active) setTagsLoadError(getErrorMessage(requestError));
      });
    return () => { active = false; };
  }, [gameId, retry]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(playLogsPage) });
    if (gameId) params.set("gameId", gameId);
    setPlayLogsLoading(true);
    setPlayLogsError("");
    api.get<{
      data: PlayLog[];
      pagination: { total: number; totalPages: number };
    }>(`/play-logs?${params.toString()}`)
      .then(({ data }) => {
        if (!active) return;
        setPlayLogs(data.data);
        setPlayLogsTotal(data.pagination.total);
        setPlayLogsTotalPages(data.pagination.totalPages);
      })
      .catch((requestError: unknown) => {
        if (active) setPlayLogsError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setPlayLogsLoading(false);
      });
    return () => { active = false; };
  }, [gameId, playLogsPage, playLogsRevision]);

  useEffect(() => {
    let active = true;
    setGameReviews(null);
    setReviewsLoading(true);
    setReviewsError("");
    setReviewsLoadError("");
    setAwardDraft({ name: "", category: "", year: "" });
    if (!gameId) {
      setReviewsLoading(false);
      return () => { active = false; };
    }

    api.get<{ data: GameReviews }>(`/games/${gameId}/reviews`)
      .then(({ data }) => {
        if (!active) return;
        setGameReviews(data.data);
        setRatingDraft(emptyRatingDraft(data.data.myRating));
      })
      .catch((requestError: unknown) => {
        if (active) setReviewsLoadError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setReviewsLoading(false);
      });
    return () => { active = false; };
  }, [gameId, reviewsRevision]);

  async function saveDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gameId) return;
    setDescriptionSaving(true);
    setDescriptionError("");
    setDescriptionNotice("");
    try {
      const { data } = await api.patch<{ data: { description: string | null } }>(
        `/games/${gameId}`,
        { description: descriptionDraft.trim() || null },
      );
      setGame((current) => current ? { ...current, description: data.data.description } : current);
      setDescriptionDraft(data.data.description ?? "");
      setDescriptionEditing(false);
      setDescriptionNotice("Description saved.");
    } catch (requestError) {
      setDescriptionError(getErrorMessage(requestError));
    } finally {
      setDescriptionSaving(false);
    }
  }

  async function assignTag(tagId: string) {
    if (!gameId) return;
    setTagBusy(true);
    setTagError("");
    setTagNotice("");
    try {
      const { data } = await api.post<{ data: Tag[] }>(`/games/${gameId}/tags`, { tagId });
      setGame((current) => current ? { ...current, tags: data.data } : current);
      setSelectedTagId("");
      setTagNotice("The tag has been added to this game.");
    } catch (requestError) {
      setTagError(getErrorMessage(requestError));
    } finally {
      setTagBusy(false);
    }
  }

  async function removeTag(tagId: string): Promise<boolean> {
    if (!gameId) return false;
    setTagBusy(true);
    setTagError("");
    setTagNotice("");
    try {
      const { data } = await api.delete<{ data: Tag[] }>(`/games/${gameId}/tags/${tagId}`);
      setGame((current) => current ? { ...current, tags: data.data } : current);
      setTagNotice("The tag has been removed from this game.");
      return true;
    } catch (requestError) {
      setTagError(getErrorMessage(requestError));
      return false;
    } finally {
      setTagBusy(false);
    }
  }

  async function addSelectedTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedTagId) await assignTag(selectedTagId);
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gameId || !newTagName.trim()) return;
    setTagBusy(true);
    setTagError("");
    setTagNotice("");
    try {
      const { data: created } = await api.post<{ data: Tag }>("/tags", { name: newTagName.trim() });
      setAvailableTags((current) =>
        [...current, created.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      const { data: assigned } = await api.post<{ data: Tag[] }>(`/games/${gameId}/tags`, {
        tagId: created.data.id,
      });
      setGame((current) => current ? { ...current, tags: assigned.data } : current);
      setNewTagName("");
      setTagNotice(`“${created.data.name}” has been created and added.`);
    } catch (requestError) {
      setTagError(getErrorMessage(requestError));
    } finally {
      setTagBusy(false);
    }
  }

  function openNewDocument(title = "") {
    setDocumentTitleDraft(title);
    setDocumentContentDraft("");
    setDocumentEditor({ mode: "new" });
    setDocumentError("");
    setDocumentNotice("");
    setPendingDocumentDelete(null);
  }

  function openDocumentEditor(document: GameDocument) {
    setOpenDocumentIds((current) => new Set([...current, document.id]));
    setDocumentTitleDraft(document.title);
    setDocumentContentDraft(document.content);
    setDocumentEditor({ mode: "edit", document });
    setDocumentError("");
    setDocumentNotice("");
    setPendingDocumentDelete(null);
  }

  function setDocumentExpanded(documentId: string, expanded: boolean) {
    setOpenDocumentIds((current) => {
      if (current.has(documentId) === expanded) return current;
      const next = new Set(current);
      if (expanded) next.add(documentId);
      else next.delete(documentId);
      return next;
    });
  }

  function closeDocumentEditor() {
    setDocumentEditor(null);
    setDocumentError("");
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gameId || !documentEditor) return;
    setDocumentBusy(true);
    setDocumentError("");
    setDocumentNotice("");
    const body = {
      title: documentTitleDraft.trim(),
      content: documentContentDraft,
    };
    try {
      if (documentEditor.mode === "new") {
        const { data } = await api.post<{ data: GameDocument }>(`/games/${gameId}/documents`, body);
        setGame((current) => current
          ? {
              ...current,
              documents: [...current.documents, data.data].sort((left, right) => left.order - right.order),
            }
          : current);
        if (isRulesDocument(data.data) && !game?.documents.some(isRulesDocument)) {
          setDocumentExpanded(data.data.id, true);
        }
        setDocumentNotice(`“${data.data.title}” has been added.`);
      } else {
        const { data } = await api.patch<{ data: GameDocument }>(
          `/games/${gameId}/documents/${documentEditor.document.id}`,
          body,
        );
        setGame((current) => current
          ? {
              ...current,
              documents: current.documents.map((document) =>
                document.id === data.data.id ? data.data : document,
              ),
            }
          : current);
        setDocumentNotice(`“${data.data.title}” has been saved.`);
      }
      setDocumentEditor(null);
    } catch (requestError) {
      setDocumentError(getErrorMessage(requestError));
    } finally {
      setDocumentBusy(false);
    }
  }

  async function deleteDocument() {
    if (!gameId || !pendingDocumentDelete) return;
    setDocumentBusy(true);
    setDocumentError("");
    setDocumentNotice("");
    try {
      await api.delete(`/games/${gameId}/documents/${pendingDocumentDelete.id}`);
      setGame((current) => current
        ? {
            ...current,
            documents: current.documents.filter((document) => document.id !== pendingDocumentDelete.id),
          }
        : current);
      setDocumentNotice(`“${pendingDocumentDelete.title}” has been removed.`);
      setPendingDocumentDelete(null);
    } catch (requestError) {
      setDocumentError(getErrorMessage(requestError));
    } finally {
      setDocumentBusy(false);
    }
  }

  async function saveRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gameId || ratingDraft.overall < 1 || ratingDraft.overall > 5) return;
    setRatingBusy(true);
    setReviewsError("");
    setReviewsNotice("");
    const body = {
      overall: ratingDraft.overall,
      luckFactor: ratingDraft.luckFactor ? Number(ratingDraft.luckFactor) : null,
      strategyDepth: ratingDraft.strategyDepth ? Number(ratingDraft.strategyDepth) : null,
      socialDeduction: ratingDraft.socialDeduction ? Number(ratingDraft.socialDeduction) : null,
      logicalDeduction: ratingDraft.logicalDeduction ? Number(ratingDraft.logicalDeduction) : null,
      playerInteraction: ratingDraft.playerInteraction ? Number(ratingDraft.playerInteraction) : null,
      complexity: ratingDraft.complexity ? Number(ratingDraft.complexity) : null,
      comment: ratingDraft.comment.trim() || null,
    };
    try {
      await api.put(`/games/${gameId}/ratings/me`, body);
      setReviewsNotice("Your rating has been saved.");
      setReviewsRevision((value) => value + 1);
    } catch (requestError) {
      setReviewsError(getErrorMessage(requestError));
    } finally {
      setRatingBusy(false);
    }
  }

  async function deleteRating(): Promise<boolean> {
    if (!gameId || !gameReviews?.myRating) return false;
    setRatingBusy(true);
    setReviewsError("");
    setReviewsNotice("");
    try {
      await api.delete(`/games/${gameId}/ratings/me`);
      setReviewsNotice("Your rating has been removed.");
      setRatingDraft(emptyRatingDraft());
      setReviewsRevision((value) => value + 1);
      return true;
    } catch (requestError) {
      setReviewsError(getErrorMessage(requestError));
      return false;
    } finally {
      setRatingBusy(false);
    }
  }

  async function addAward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gameId) return;
    setAwardSaving(true);
    setReviewsError("");
    setReviewsNotice("");
    try {
      await api.post(`/games/${gameId}/awards`, {
        name: awardDraft.name.trim(),
        category: awardDraft.category.trim() || null,
        year: awardDraft.year ? Number(awardDraft.year) : null,
      });
      setAwardDraft({ name: "", category: "", year: "" });
      setReviewsNotice("Award added to the dossier.");
      setReviewsRevision((value) => value + 1);
    } catch (requestError) {
      setReviewsError(getErrorMessage(requestError));
    } finally {
      setAwardSaving(false);
    }
  }

  async function deleteAward(award: GameAward): Promise<boolean> {
    if (!gameId) return false;
    setAwardBusyId(award.id);
    setReviewsError("");
    setReviewsNotice("");
    try {
      await api.delete(`/games/${gameId}/awards/${award.id}`);
      setReviewsNotice(`“${award.name}” removed from the dossier.`);
      setReviewsRevision((value) => value + 1);
      return true;
    } catch (requestError) {
      setReviewsError(getErrorMessage(requestError));
      return false;
    } finally {
      setAwardBusyId("");
    }
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return;
    const confirmed = pendingRemoval;
    const removed = confirmed.kind === "rating"
      ? await deleteRating()
      : confirmed.kind === "award"
        ? await deleteAward(confirmed.award)
        : await removeTag(confirmed.tag.id);
    if (removed) setPendingRemoval(null);
  }

  function renderDocumentEditor(lockedTitle: boolean) {
    return (
      <form className="dossier-document-editor" onSubmit={saveDocument}>
        <div className="dossier-document-editor__fields">
          <label>
            <span className="field-label">Document title</span>
            <input
              disabled={lockedTitle}
              maxLength={100}
              onChange={(event) => setDocumentTitleDraft(event.target.value)}
              required
              value={documentTitleDraft}
            />
          </label>
          <label>
            Markdown content
            <textarea
              maxLength={100_000}
              onChange={(event) => setDocumentContentDraft(event.target.value)}
              placeholder="Write rules, campaign notes, setup variations, or other game documents in Markdown…"
              rows={12}
              value={documentContentDraft}
            />
          </label>
        </div>
        <div className="dossier-document-preview">
          <Eyebrow>LIVE PREVIEW</Eyebrow>
          <div className="markdown-copy">
            {documentContentDraft.trim()
              ? <ReactMarkdown>{documentContentDraft}</ReactMarkdown>
              : <p className="dossier-document-preview__empty">Your formatted document will appear here.</p>}
          </div>
        </div>
        <div className="dossier-document-editor__footer">
          <span>{documentContentDraft.length.toLocaleString()} / 100,000 characters</span>
          <div>
            <Button className="button button--quiet" disabled={documentBusy} onClick={closeDocumentEditor} type="button">
              Cancel
            </Button>
            <Button className="button button--primary" disabled={documentBusy} type="submit">
              {documentBusy ? "Saving…" : documentEditor?.mode === "new" ? "Add document" : "Save document"}
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="library-shell game-dossier-shell">
      <LibraryRail player={player} onLogout={onLogout}>
        <LibraryNavigation backTo={backTo} />
        
      </LibraryRail>

      <main className="library-main dossier-main">
        <LibraryTopbar section="My collection" page="Game details" />

        {loading ? (
          <div className="empty-state dossier-loading" role="status" aria-live="polite"><p>Opening the game dossier…</p></div>
        ) : error || loadFailed || !game ? (
          <div className="empty-state dossier-loading" role="alert">
            <LibraryIcon name="collection" className="empty-state__ornament" />
            <h1>{loadFailed ? "The dossier is unavailable." : "The page is missing from the stacks."}</h1>
            {error ? (
              <FeedbackMessage
                message={error}
                onDismiss={() => setError("")}
                onRetry={() => setRetry((value) => value + 1)}
              />
            ) : (
              <p>{loadFailed ? "The game information is still unavailable." : "This game could not be found."}</p>
            )}
            {loadFailed && (
              <Button className="button button--primary" onClick={() => setRetry((value) => value + 1)} type="button">
                Refresh dossier
              </Button>
            )}
          </div>
        ) : (
          <>
            <Link className="dossier-back" to={backTo}>← Return to the stacks</Link>
            <section className="dossier-hero">
              <div className={`dossier-cover ${game.imageUrl ? "dossier-cover--image" : ""}`}>
                {game.imageUrl
                  ? <img src={game.imageUrl} alt={`${game.name} cover`} />
                  : <div className="dossier-cover__placeholder"><span>The game library</span><strong>{game.name}</strong><LibraryIcon name="play" className="dossier-cover__symbol" /> </div>}
              </div>
              <div className="dossier-hero__copy">
                <Eyebrow>GAME DOSSIER · {game.releaseYear ?? "YEAR UNKNOWN"}</Eyebrow>
                <h1>{game.name}</h1>
                <p className="dossier-maker">{game.maker}</p>
                <p className="dossier-location">
                  <span className="dossier-location__icon"><LibraryIcon name="shelf" /></span>
                  {game.shelf.name} <i>·</i> Level {game.shelfNumber}
                </p>
                {game.tags.length > 0 && (
                  <div className="dossier-tags" aria-label="Game tags">
                    {game.tags.map((tag) => (
                      <span className="dossier-tag-chip" key={tag.id} style={tagStyle(tag.name)}>#{tag.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <nav className="dossier-index" aria-label="Dossier sections">
              <a aria-current={activeDossierSection === "overview" ? "location" : undefined} href="#overview">Overview</a>
              <a aria-current={activeDossierSection === "ratings-awards" ? "location" : undefined} href="#ratings-awards">Ratings &amp; awards</a>
              <a aria-current={activeDossierSection === "tags" ? "location" : undefined} href="#tags">Tags</a>
              <a aria-current={activeDossierSection === "documents" ? "location" : undefined} href="#documents">Documents</a>
              <a aria-current={activeDossierSection === "play-history" ? "location" : undefined} href="#play-history">Play history</a>
            </nav>

            <section className="dossier-section" id="overview">
              <div className="dossier-section__heading">
                <Eyebrow>AT A GLANCE</Eyebrow>
                <h2>On the table</h2>
              </div>
              <dl className="dossier-facts">
                <div><dt>Players</dt><dd>{playerCount(game)}</dd></div>
                <div><dt>Playing time</dt><dd>{game.playTime ? `${game.playTime} min` : "Not listed"}</dd></div>
                <div><dt>Age recommendation</dt><dd>{game.ageLimit !== null ? `${game.ageLimit}+` : "Not listed"}</dd></div>
                <div><dt>Box orientation</dt><dd>{game.orientation}</dd></div>
              </dl>
              <div className="dossier-story">
                <div className="dossier-story__heading">
                  <div>
                    <Eyebrow>THE STORY SO FAR</Eyebrow>
                    <h3>About this game</h3>
                  </div>
                  {!descriptionEditing && (
                    <Button className="button button--quiet" onClick={() => setDescriptionEditing(true)} type="button">
                      Edit description
                    </Button>
                  )}
                </div>
                {descriptionEditing ? (
                  <form className="dossier-description-form" onSubmit={saveDescription}>
                    <label htmlFor="game-description">Short description</label>
                    <textarea
                      id="game-description"
                      maxLength={500}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      placeholder="What makes this game special?"
                      rows={4}
                      value={descriptionDraft}
                    />
                    <div className="dossier-description-form__footer">
                      <span>{descriptionDraft.length}/500</span>
                      <div>
                        <Button
                          className="button button--quiet"
                          disabled={descriptionSaving}
                          onClick={() => {
                            setDescriptionDraft(game.description ?? "");
                            setDescriptionEditing(false);
                            setDescriptionError("");
                          }}
                          type="button"
                        >
                          Cancel
                        </Button>
                        <Button className="button button--primary" disabled={descriptionSaving} type="submit">
                          {descriptionSaving ? "Saving…" : "Save description"}
                        </Button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <p>{game.description || "A beloved part of the collection, waiting for its story to be written."}</p>
                )}
                {descriptionError && (
                  <FeedbackMessage className="dossier-tag-message dossier-tag-message--error" message={descriptionError} onDismiss={() => setDescriptionError("")} />
                )}
                {descriptionNotice && (
                  <FeedbackMessage className="dossier-tag-message" message={descriptionNotice} onDismiss={() => setDescriptionNotice("")} tone="success" />
                )}
              </div>
            </section>

            <section className="dossier-section game-feedback" id="ratings-awards">
              <div className="dossier-section__heading">
                <Eyebrow>THE TABLE’S VERDICT</Eyebrow>
                <h2>Ratings &amp; awards</h2>
                {gameReviews && (
                  <span className="game-feedback__rating-count">
                    {gameReviews.ratingCount} {gameReviews.ratingCount === 1 ? "rating" : "ratings"}
                  </span>
                )}
              </div>
              {reviewsError && (
                <FeedbackMessage className="dossier-tag-message dossier-tag-message--error" message={reviewsError} onDismiss={() => setReviewsError("")} />
              )}
              {reviewsLoadError && (
                <FeedbackMessage
                  className="dossier-tag-message dossier-tag-message--error"
                  message={reviewsLoadError}
                  onDismiss={() => setReviewsLoadError("")}
                  onRetry={() => setReviewsRevision((value) => value + 1)}
                />
              )}
              {reviewsNotice && (
                <FeedbackMessage className="dossier-tag-message" message={reviewsNotice} onDismiss={() => setReviewsNotice("")} tone="success" />
              )}
              {reviewsLoading ? (
                <div className="dossier-coming" role="status"><p>Gathering the table’s impressions…</p></div>
              ) : gameReviews ? (
                <>
                  <div className="game-feedback__overview">
                    <article className="game-feedback__score">
                      <Eyebrow>COMMUNITY SCORE</Eyebrow>
                      <strong>{gameReviews.overallAverage?.toFixed(1) ?? "—"}<small> / 5</small></strong>
                      <span className="game-feedback__stars" aria-label={
                        gameReviews.overallAverage === null
                          ? "No ratings yet"
                          : `Average ${gameReviews.overallAverage.toFixed(1)} out of 5`
                      }>
                        {gameReviews.overallAverage === null
                          ? "☆☆☆☆☆"
                          : ratingStars(Math.round(gameReviews.overallAverage))}
                      </span>
                      <small>From {gameReviews.ratingCount} app {gameReviews.ratingCount === 1 ? "user" : "users"}</small>
                    </article>
                    <div className="game-feedback__dimensions" aria-label="Game characteristic averages">
                      {ratingDimensions.map((dimension) => {
                        const metric = gameReviews.dimensionAverages[dimension.key];
                        return (
                          <article className="game-feedback__dimension" key={dimension.key}>
                            <div>
                              <strong>{dimension.label}</strong>
                              <span>{metric.average === null ? "—" : `${metric.average.toFixed(1)} / 5`}</span>
                            </div>
                            <div className="game-feedback__bar">
                              <span style={{ width: `${metric.average === null ? 0 : (metric.average / 5) * 100}%` }} />
                            </div>
                            <small>{dimension.guide}<i>{metric.count} rated</i></small>
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <div className="game-feedback__columns">
                    <section className="game-rating-form">
                      <div className="game-feedback__subheading">
                        <div>
                          <Eyebrow>YOUR IMPRESSION</Eyebrow>
                          <h3>{gameReviews.myRating ? "Update your rating" : "Rate this game"}</h3>
                        </div>
                      </div>
                      <form onSubmit={saveRating}>
                        <fieldset className="game-rating-form__overall">
                          <legend>Overall rating <span className="required-mark" aria-hidden="true">*</span></legend>
                          <div className="game-rating-form__stars" role="group" aria-label="Overall rating from one to five stars">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <Button
                                aria-label={`${value} out of 5 stars`}
                                aria-pressed={ratingDraft.overall === value}
                                className={value <= ratingDraft.overall ? "is-selected" : ""}
                                disabled={ratingBusy}
                                key={value}
                                onClick={() => setRatingDraft((draft) => ({ ...draft, overall: value }))}
                                type="button"
                              >
                                ★
                              </Button>
                            ))}
                            <span>{ratingDraft.overall ? `${ratingDraft.overall} / 5` : "Choose a score"}</span>
                          </div>
                        </fieldset>
                        <div className="game-rating-form__dimensions">
                          {ratingDimensions.map((dimension) => (
                            <label key={dimension.key}>
                              <span>{dimension.label}<small>{dimension.guide}</small></span>
                              <select
                                disabled={ratingBusy}
                                onChange={(event) => setRatingDraft((draft) => ({
                                  ...draft,
                                  [dimension.key]: event.target.value,
                                }))}
                                value={ratingDraft[dimension.key]}
                              >
                                <option value="">Not rated</option>
                                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                        <label className="game-rating-form__comment">
                          Comment
                          <textarea
                            disabled={ratingBusy}
                            maxLength={2000}
                            onChange={(event) => setRatingDraft((draft) => ({ ...draft, comment: event.target.value }))}
                            placeholder="What stood out at your table?"
                            rows={3}
                            value={ratingDraft.comment}
                          />
                        </label>
                        <div className="game-rating-form__footer">
                          {gameReviews.myRating && (
                            <Button
                              className="button button--quiet"
                              disabled={ratingBusy}
                              onClick={() => setPendingRemoval({ kind: "rating" })}
                              type="button"
                            >
                              Remove my rating
                            </Button>
                          )}
                          <Button className="button button--primary" disabled={ratingBusy || ratingDraft.overall === 0} type="submit">
                            {ratingBusy ? "Saving…" : gameReviews.myRating ? "Update rating" : "Save rating"}
                          </Button>
                        </div>
                      </form>
                    </section>

                    <section className="game-awards">
                      <div className="game-feedback__subheading">
                        <div><Eyebrow>HONOURS</Eyebrow><h3>Awards won</h3></div>
                      </div>
                      {gameReviews.awards.length ? (
                        <ul className="game-awards__list">
                          {gameReviews.awards.map((award) => (
                            <li key={award.id}>
                              <span className="game-awards__seal"><LibraryIcon name="award" /></span>
                              <span className="game-awards__copy">
                                <strong>{award.name}</strong>
                                {(award.category || award.year) && (
                                  <small>{[award.category, award.year].filter(Boolean).join(" · ")}</small>
                                )}
                              </span>
                              <Button
                                aria-label={`Remove ${award.name} award`}
                                disabled={awardBusyId !== ""}
                                onClick={() => setPendingRemoval({ kind: "award", award })}
                                type="button"
                              >
                                {awardBusyId === award.id ? "…" : "×"}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="game-awards__empty">No awards have been recorded for this game.</p>
                      )}
                      <form className="game-awards__form" onSubmit={addAward}>
                        <label>
                          <span className="field-label">Award name</span>
                          <input
                            maxLength={120}
                            onChange={(event) => setAwardDraft((draft) => ({ ...draft, name: event.target.value }))}
                            placeholder="e.g. Spiel des Jahres"
                            required
                            value={awardDraft.name}
                          />
                        </label>
                        <div className="game-awards__form-row">
                          <label>
                            Category
                            <input
                              maxLength={120}
                              onChange={(event) => setAwardDraft((draft) => ({ ...draft, category: event.target.value }))}
                              placeholder="e.g. Kennerspiel"
                              value={awardDraft.category}
                            />
                          </label>
                          <label>
                            Year
                            <input
                              max="2200"
                              min="1800"
                              onChange={(event) => setAwardDraft((draft) => ({ ...draft, year: event.target.value }))}
                              placeholder="2024"
                              type="number"
                              value={awardDraft.year}
                            />
                          </label>
                        </div>
                        <Button className="button button--quiet" disabled={awardSaving} type="submit">
                          {awardSaving ? "Adding…" : "＋ Add award"}
                        </Button>
                      </form>
                    </section>
                  </div>

                  <section className="game-feedback__reviews">
                    <div className="game-feedback__subheading">
                      <div><Eyebrow>AROUND THE TABLE</Eyebrow><h3>Player ratings</h3></div>
                    </div>
                    {gameReviews.ratings.length ? (
                      <div className="game-feedback__review-list">
                        {gameReviews.ratings.map((rating) => (
                          <article className="game-feedback__review" key={rating.id}>
                            <header>
                              <div><strong>{rating.playerName}</strong>{rating.isMine && <span>You</span>}</div>
                              <time dateTime={rating.updatedAt}>
                                {new Date(rating.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                              </time>
                            </header>
                            <div className="game-feedback__review-score">
                              <span aria-label={`${rating.overall} out of 5 stars`}>{ratingStars(rating.overall)}</span>
                              <strong>{rating.overall} / 5</strong>
                            </div>
                            {rating.comment && <p>{rating.comment}</p>}
                            <div className="game-feedback__review-factors">
                              {ratingDimensions.map((dimension) => {
                                const value = rating[dimension.key];
                                return value === null ? null : (
                                  <span key={dimension.key}>{dimension.label}<b>{value}/5</b></span>
                                );
                              })}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="game-feedback__empty">No ratings yet. Your impression can start the conversation.</p>
                    )}
                  </section>
                </>
              ) : null}
            </section>

            <section className="dossier-section" id="tags">
              <div className="dossier-section__heading">
                <Eyebrow>CLASSIFICATION</Eyebrow>
                <h2>Tags &amp; categories</h2>
              </div>
              <div className="dossier-tag-list" aria-label="Assigned tags">
                {game.tags.map((tag) => (
                  <span
                    className="dossier-tag-pill"
                    key={tag.id}
                    style={tagStyle(tag.name)}
                  >
                    #{tag.name}
                    <Button
                      aria-label={`Remove ${tag.name} from ${game.name}`}
                      disabled={tagBusy}
                      onClick={() => setPendingRemoval({ kind: "tag", tag })}
                      type="button"
                    >
                      ×
                    </Button>
                  </span>
                ))}
                {game.tags.length === 0 && <p className="dossier-tag-empty">No tags have been added to this game yet.</p>}
              </div>
              <div className="dossier-tag-controls">
                {availableTags.some((tag) => !game.tags.some((assigned) => assigned.id === tag.id)) && (
                  <form className="dossier-tag-form" onSubmit={addSelectedTag}>
                    <label>
                      Existing tag
                      <select
                        aria-label="Choose an existing tag"
                        disabled={tagBusy}
                        onChange={(event) => setSelectedTagId(event.target.value)}
                        value={selectedTagId}
                      >
                        <option value="">Choose a tag…</option>
                        {availableTags
                          .filter((tag) => !game.tags.some((assigned) => assigned.id === tag.id))
                          .map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                      </select>
                    </label>
                    <Button className="button button--quiet" disabled={tagBusy || !selectedTagId} type="submit">
                      Add tag
                    </Button>
                  </form>
                )}
                <form className="dossier-tag-form" onSubmit={createTag}>
                  <label>
                    Create a new tag
                    <input
                      maxLength={40}
                      onChange={(event) => setNewTagName(event.target.value)}
                      placeholder="e.g. cooperative"
                      value={newTagName}
                    />
                    <small>The # is added when displayed; enter the name without it.</small>
                  </label>
                  <Button className="button button--primary" disabled={tagBusy || !newTagName.trim()} type="submit">
                    Create &amp; add
                  </Button>
                </form>
              </div>
              {tagError && (
                <FeedbackMessage className="dossier-tag-message dossier-tag-message--error" message={tagError} onDismiss={() => setTagError("")} />
              )}
              {tagsLoadError && (
                <FeedbackMessage
                  className="dossier-tag-message dossier-tag-message--error"
                  message={tagsLoadError}
                  onDismiss={() => setTagsLoadError("")}
                  onRetry={() => setRetry((value) => value + 1)}
                />
              )}
              {tagNotice && (
                <FeedbackMessage className="dossier-tag-message" message={tagNotice} onDismiss={() => setTagNotice("")} tone="success" />
              )}
            </section>

            <section className="dossier-section" id="documents">
              <div className="dossier-section__heading">
                <Eyebrow>THE ARCHIVE</Eyebrow>
                <h2>Rules &amp; documents</h2>
                <Button
                  className="button button--quiet"
                  disabled={documentEditor !== null || documentBusy}
                  onClick={() => openNewDocument()}
                  type="button"
                >
                  ＋ Add document
                </Button>
              </div>
              {documentEditor?.mode === "new" && renderDocumentEditor(false)}
              {game.documents.map((document) => {
                const isRules = isRulesDocument(document);
                const isEditing = documentEditor?.mode === "edit" &&
                  documentEditor.document.id === document.id;
                const isOpen = openDocumentIds.has(document.id);
                return (
                  <article className="dossier-document" key={document.id}>
                    <div className="dossier-document__heading">
                      <Button
                        aria-controls={`document-content-${document.id}`}
                        aria-expanded={isOpen}
                        className="dossier-document__toggle"
                        onClick={() => setDocumentExpanded(document.id, !isOpen)}
                        type="button"
                      >
                        <span className="dossier-document__title">
                          <Eyebrow>{isRules ? "REQUIRED RULES" : "GAME DOCUMENT"}</Eyebrow>
                          <strong>{document.title}</strong>
                        </span>
                        <span className="dossier-document__chevron" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                      </Button>
                      {!isEditing && (
                        <div className="dossier-document__actions">
                          <Button
                            className="button button--quiet"
                            disabled={documentEditor !== null || documentBusy}
                            onClick={() => openDocumentEditor(document)}
                            type="button"
                          >
                            Edit
                          </Button>
                          {!isRules && (
                            <Button
                              className="button button--quiet dossier-document__remove"
                              disabled={documentEditor !== null || documentBusy}
                              onClick={() => {
                                setDocumentExpanded(document.id, true);
                                setPendingDocumentDelete(document);
                              }}
                              type="button"
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div
                      className="dossier-document__body"
                      hidden={!isOpen}
                      id={`document-content-${document.id}`}
                    >
                      {isEditing ? renderDocumentEditor(isRules) : (
                        <>
                          {document.content.trim()
                            ? <div className="markdown-copy"><ReactMarkdown>{document.content}</ReactMarkdown></div>
                            : <p className="dossier-document__empty">
                                {isRules
                                  ? "The rules have not been written yet. Edit this document to add them."
                                  : "This document is empty. Edit it to add Markdown content."}
                              </p>}
                          {pendingDocumentDelete?.id === document.id && (
                            <div className="dossier-document-confirm" role="group" aria-label={`Confirm removal of ${document.title}`}>
                              <p>Remove “{document.title}” from this game?</p>
                              <Button
                                className="button button--quiet"
                                disabled={documentBusy}
                                onClick={() => setPendingDocumentDelete(null)}
                                type="button"
                              >
                                Keep document
                              </Button>
                              <Button
                                className="button dossier-document__remove"
                                disabled={documentBusy}
                                onClick={deleteDocument}
                                type="button"
                              >
                                Remove document
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
              {!game.documents.some(isRulesDocument) && (
                <div className="dossier-coming">
                  <LibraryIcon name="wiki" />
                  <p>This game does not have a Rules document yet.</p>
                  <Button
                    className="button button--quiet"
                    disabled={documentEditor !== null || documentBusy}
                    onClick={() => openNewDocument("Rules")}
                    type="button"
                  >
                    Add required Rules
                  </Button>
                </div>
              )}
              {documentError && (
                <FeedbackMessage className="dossier-tag-message dossier-tag-message--error" message={documentError} onDismiss={() => setDocumentError("")} />
              )}
              {documentNotice && (
                <FeedbackMessage className="dossier-tag-message" message={documentNotice} onDismiss={() => setDocumentNotice("")} tone="success" />
              )}
            </section>

            <section className="dossier-section" id="play-history">
              <div className="dossier-section__heading">
                <Eyebrow>TALES FROM THE TABLE</Eyebrow>
                <h2>Play history</h2>
                <ButtonLink to={`/logs?gameId=${game.id}`} variant="primary">
                  Record a session
                </ButtonLink>
              </div>
              {playLogsError && (
                <FeedbackMessage
                  className="dossier-tag-message dossier-tag-message--error"
                  message={playLogsError}
                  onDismiss={() => setPlayLogsError("")}
                  onRetry={() => setPlayLogsRevision((value) => value + 1)}
                  retryLabel="Retry"
                />
              )}
              {playLogsLoading && playLogs.length === 0 ? (
                <div className="dossier-coming" role="status"><p>Opening the table chronicle…</p></div>
              ) : playLogs.length > 0 ? (
                <div className={`play-log-list ${playLogsLoading ? "is-loading" : ""}`} aria-busy={playLogsLoading}>
                  {playLogs.map((log) => <PlayLogCard key={log.id} log={log} showGame={false} />)}
                </div>
              ) : (
                <div className="dossier-coming">
                  <LibraryIcon name="chronicle" />
                  <p>No sessions have been recorded for this game yet.</p>
                  <ButtonLink to={`/logs?gameId=${game.id}`} variant="quiet">Record the first session</ButtonLink>
                </div>
              )}
              {playLogsTotal > 100 && (
                <nav className="play-log-pagination" aria-label="Game play history pages">
                  <Button
                    className="button button--quiet"
                    disabled={playLogsPage <= 1 || playLogsLoading}
                    onClick={() => setPlayLogsPage((value) => Math.max(1, value - 1))}
                    type="button"
                  >
                    ← Newer
                  </Button>
                  <span>{playLogsTotal.toLocaleString()} sessions <i>·</i> Page {playLogsPage} of {playLogsTotalPages}</span>
                  <Button
                    className="button button--quiet"
                    disabled={playLogsPage >= playLogsTotalPages || playLogsLoading}
                    onClick={() => setPlayLogsPage((value) => Math.min(playLogsTotalPages, value + 1))}
                    type="button"
                  >
                    Older →
                  </Button>
                </nav>
              )}
            </section>

            <footer className="library-footer"><span>Filed with care</span></footer>
          </>
        )}
      </main>
      {pendingRemoval && (
        <ConfirmationDialog
          busy={pendingRemoval.kind === "rating"
            ? ratingBusy
            : pendingRemoval.kind === "award"
              ? awardBusyId !== ""
              : tagBusy}
          confirmLabel={pendingRemoval.kind === "tag"
            ? "Remove tag"
            : pendingRemoval.kind === "award"
              ? "Remove award"
              : "Remove rating"}
          description={pendingRemoval.kind === "tag"
            ? `Remove “${pendingRemoval.tag.name}” from this game?`
            : pendingRemoval.kind === "award"
              ? `Remove “${pendingRemoval.award.name}” from this game?`
              : "Remove your rating and comment from this game?"}
          error={pendingRemoval.kind === "tag" ? tagError : reviewsError}
          onCancel={() => {
            setPendingRemoval(null);
            if (pendingRemoval.kind === "tag") setTagError("");
            else setReviewsError("");
          }}
          onConfirm={() => void confirmRemoval()}
          onDismissError={() => {
            if (pendingRemoval.kind === "tag") setTagError("");
            else setReviewsError("");
          }}
          title={pendingRemoval.kind === "tag"
            ? "Remove tag?"
            : pendingRemoval.kind === "award"
              ? "Remove award?"
              : "Remove rating?"}
        />
      )}
    </div>
  );
}
