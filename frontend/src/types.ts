export interface Player {
  id: string;
  username: string;
  fullName: string;
  isAdmin: boolean;
}

export interface AuthResponse {
  token: string;
  player: Player;
}

export interface Shelf {
  id: string;
  name: string;
  type: string;
  color: string | null;
  cabinetColor: string | null;
  shelfCount: number;
  width: number | null;
  height: number | null;
  depth: number | null;
  description: string | null;
  _count: { games: number };
}

export interface Game {
  id: string;
  name: string;
  maker: string;
  releaseYear: number | null;
  description: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  ageLimit: number | null;
  playTime: number | null;
  imageUrl: string | null;
  orientation: "vertical" | "horizontal" | "flat" | "stacked";
  stackedOnId: string | null;
  shelfId: string;
  shelfNumber: number;
  position: number;
  shelf: {
    id: string;
    name: string;
    type: string;
    color?: string | null;
    shelfCount?: number;
    width?: number | null;
    height?: number | null;
    depth?: number | null;
  };
  tags: Tag[];
}

export interface DeletedGameMatch {
  id: string;
  gameId: string;
  name: string;
  maker: string;
  releaseYear: number | null;
  deletedAt: string;
}

export interface GameArrangementItem {
  id: string;
  order: number;
  stackedOnId: string | null;
  orientation?: "vertical" | "horizontal" | "flat";
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface GameDocument {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface GameDetails extends Game {
  documents: GameDocument[];
}

export interface AmbienceLink {
  id: string;
  title: string;
  kind: "music" | "visual" | "both";
  uri: string;
  position: number;
}

export interface AmbienceSet {
  id: string;
  name: string;
  description: string | null;
  games: Pick<Game, "id" | "name" | "maker">[];
  tags: Tag[];
  links: AmbienceLink[];
  createdAt: string;
  updatedAt: string;
}

export interface GameRating {
  id: string;
  overall: number;
  luckFactor: number | null;
  strategyDepth: number | null;
  socialDeduction: number | null;
  logicalDeduction: number | null;
  playerInteraction: number | null;
  complexity: number | null;
  comment: string | null;
  playerName: string;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GameAward {
  id: string;
  name: string;
  category: string | null;
  year: number | null;
  createdAt: string;
}

export interface GameReviews {
  ratingCount: number;
  overallAverage: number | null;
  dimensionAverages: {
    luckFactor: { average: number | null; count: number };
    strategyDepth: { average: number | null; count: number };
    socialDeduction: { average: number | null; count: number };
    logicalDeduction: { average: number | null; count: number };
    playerInteraction: { average: number | null; count: number };
    complexity: { average: number | null; count: number };
  };
  myRating: GameRating | null;
  ratings: GameRating[];
  awards: GameAward[];
}

export interface WikiCategory {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count: { entries: number };
}

export interface WikiEntry {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  category: Pick<WikiCategory, "id" | "title">;
  tags: Tag[];
  games: Pick<Game, "id" | "name" | "maker">[];
  createdAt: string;
  updatedAt: string;
}

export interface PlayLogParticipant {
  id: string;
  playerId: string | null;
  displayName: string;
  placement: number | null;
  score: number | null;
}

export interface PlayLog {
  id: string;
  gameId: string | null;
  guestGameId: string | null;
  playedAt: string;
  duration: number | null;
  location: string | null;
  notes: string | null;
  game: {
    id: string;
    name: string;
    tags: Pick<Tag, "id" | "name">[];
  } | null;
  guestGame: { id: string; name: string } | null;
  participants: PlayLogParticipant[];
}

export interface OngoingGame {
  id: string;
  gameId: string | null;
  guestGameId: string | null;
  startedAt: string;
  pausedAt: string | null;
  pausedDurationSeconds: number;
  elapsedSeconds: number;
  location: string | null;
  game: {
    id: string;
    name: string;
    maker: string;
    minPlayers: number | null;
    maxPlayers: number | null;
    playTime: number | null;
    imageUrl: string | null;
    shelfNumber: number;
    tags: Pick<Tag, "id" | "name">[];
    shelf: Pick<Shelf, "id" | "name" | "type">;
  } | null;
  guestGame: { id: string; name: string } | null;
  participants: { id: string; playerId: string | null; displayName: string }[];
}

export interface PlayLogStatistics {
  totalSessions: number;
  totalParticipants: number;
  uniquePlayers: number;
  totalDurationMinutes: number;
  averageDurationMinutes: number | null;
  mostPlayedGames: {
    gameId: string | null;
    guestGameId: string | null;
    name: string;
    plays: number;
  }[];
  topWinners: { playerId: string | null; name: string; wins: number }[];
}
