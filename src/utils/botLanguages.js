// Ngôn ngữ bot được server chấp nhận (khớp BOT_LANGUAGES trong net/http.js).
export const BOT_LANGUAGES = [
  { id: "python", label: "Python 3.11" },
  { id: "javascript", label: "Node.js 20" },
  { id: "cpp", label: "C++17" },
];

export function languageLabels(ids = []) {
  return (ids ?? [])
    .map((id) => BOT_LANGUAGES.find((option) => option.id === id)?.label ?? id)
    .join(" · ");
}
