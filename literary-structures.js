/* literary-structures.js – Chapter literary structure outlines for KJV Study PWA
   Sparse map. Only chapters with researched outlines are present.
   Key: "Book Name ChapterNumber" e.g. "1 Kings 22"
*/
export const literaryStructures = {
  "1 Kings 22": {
    type: "concentric",
    center: "X",
    outline: [
      { label: "A", range: "22:1-4", note: "Jehoshaphat and Ahab — joint venture" },
      { label: "B", range: "22:5-6", note: "Inquiry of the prophets" },
      { label: "C", range: "22:7-9", note: "Micaiah summoned" },
      { label: "X", range: "22:10-28", note: "Prophetic contest + heavenly court (center)" },
      { label: "C′", range: "22:29-36", note: "Micaiah’s prophecy fulfilled" },
      { label: "B′", range: "22:37-38", note: "Elijah’s earlier prophecy fulfilled" },
      { label: "A′", range: "22:39-50", note: "Summaries of the reigns" }
    ]
  }
};

export function getLiteraryStructure(bookName, chapter) {
  if (!bookName || chapter == null) return null;
  const key = String(bookName).trim() + " " + String(chapter);
  return literaryStructures[key] || null;
}
