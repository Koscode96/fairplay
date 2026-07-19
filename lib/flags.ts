/** Team name -> flag emoji. Fallback: first letter. */
const FLAGS: Record<string, string> = {
  spain: "🇪🇸", argentina: "🇦🇷", france: "🇫🇷", england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", brazil: "🇧🇷",
  germany: "🇩🇪", portugal: "🇵🇹", netherlands: "🇳🇱", italy: "🇮🇹", belgium: "🇧🇪",
  croatia: "🇭🇷", morocco: "🇲🇦", japan: "🇯🇵", "united states": "🇺🇸", usa: "🇺🇸",
  mexico: "🇲🇽", uruguay: "🇺🇾", colombia: "🇨🇴", senegal: "🇸🇳", ghana: "🇬🇭",
  nigeria: "🇳🇬", denmark: "🇩🇰", switzerland: "🇨🇭", poland: "🇵🇱", "south korea": "🇰🇷",
  korea: "🇰🇷", australia: "🇦🇺", canada: "🇨🇦", ecuador: "🇪🇨", serbia: "🇷🇸",
  wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", iran: "🇮🇷", "saudi arabia": "🇸🇦", qatar: "🇶🇦",
  cameroon: "🇨🇲", tunisia: "🇹🇳", "costa rica": "🇨🇷", norway: "🇳🇴", sweden: "🇸🇪",
  austria: "🇦🇹", ukraine: "🇺🇦", turkey: "🇹🇷", chile: "🇨🇱", peru: "🇵🇪",
  paraguay: "🇵🇾", egypt: "🇪🇬", algeria: "🇩🇿", "ivory coast": "🇨🇮", mali: "🇲🇱",
};
export const flag = (team: string): string => {
  const k = (team || "").toLowerCase().trim();
  if (FLAGS[k]) return FLAGS[k];
  for (const [name, f] of Object.entries(FLAGS)) if (k.includes(name)) return f;
  return (team?.[0] ?? "?").toUpperCase();
};
