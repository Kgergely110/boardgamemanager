export function getElapsedSeconds(
  ongoingGame: {
    startedAt: Date;
    pausedAt: Date | null;
    pausedDurationSeconds: number;
  },
  now = new Date(),
): number {
  const endTime = ongoingGame.pausedAt ?? now;
  return Math.max(
    0,
    Math.floor((endTime.getTime() - ongoingGame.startedAt.getTime()) / 1000) -
      ongoingGame.pausedDurationSeconds,
  );
}
