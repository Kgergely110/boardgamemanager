import { Archive, AudioLines, Award, BookText, CircleUserRound, Dices, Heart, LibraryBig, ScrollText, type LucideIcon } from "lucide-react";

export type LibraryIconName = "collection" | "shelf" | "chronicle" | "play" | "wiki" | "ambience" | "wishlist" | "user" | "award";
const iconByName: Record<LibraryIconName, LucideIcon> = {
  collection: LibraryBig,
  shelf: Archive,
  chronicle: ScrollText,
  play: Dices,
  wiki: BookText,
  ambience: AudioLines,
  wishlist: Heart,
  user: CircleUserRound,
  award: Award,
};

export function LibraryMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 48 48"
    >
      <path d="M7.5 11.5c5.8-2.5 11.2-1.7 16.5 2.7v24.5c-5-3.6-10.5-4.2-16.5-2.4z" fill="var(--surface)" />
      <path d="M40.5 11.5c-5.8-2.5-11.2-1.7-16.5 2.7v24.5c5-3.6 10.5-4.2 16.5-2.4z" fill="var(--surface)" />
      <path d="M24 14.2v24.5" />
      <path d="M11 18.5c2.5-.5 5-.2 7.4.7m-7.4 4.6c2.2-.4 4.3-.1 6.5.7m19.5-6c-2.5-.5-5-.2-7.4.7m7.4 4.6c-2.2-.4-4.3-.1-6.5.7" />
      <rect x="18.6" y="28.1" width="10.8" height="10.8" rx="2.3" fill="var(--rail-active)" stroke="var(--rail-accent)" />
      <circle cx="22" cy="31.5" r="1" fill="var(--surface)" stroke="none" />
      <circle cx="26" cy="35.5" r="1" fill="var(--surface)" stroke="none" />
    </svg>
  );
}

interface LibraryIconProps {
  name: LibraryIconName;
  className?: string;
}

export function LibraryIcon({ name, className }: LibraryIconProps) {
  const Icon = iconByName[name];
  return <Icon aria-hidden="true" className={className} strokeWidth={1.7} />;
}
