// src/textChunker.js
const chunkText = (text, chunkSize, overlap) => {
  if (text.length === 0) {
    return [];
  }

  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    let chunk = text.substring(i, end);

    // Try to break at a natural boundary (e.g., end of sentence/paragraph)
    // if the chunk ends mid-sentence and there's enough text left.
    if (end < text.length) {
      const lastSentenceEnd = chunk.lastIndexOf('.');
      const lastParagraphEnd = chunk.lastIndexOf('\n\n');
      const lastLineEnd = chunk.lastIndexOf('\n');

      let splitPoint = -1;
      if (lastParagraphEnd > chunk.length * 0.8) { // Prefer paragraph breaks if near end
        splitPoint = lastParagraphEnd + 2;
      } else if (lastSentenceEnd > chunk.length * 0.8) { // Otherwise sentence break
        splitPoint = lastSentenceEnd + 1;
      } else if (lastLineEnd > chunk.length * 0.8) { // Failing that, line break
        splitPoint = lastLineEnd + 1;
      }

      if (splitPoint !== -1 && splitPoint < chunk.length) {
        chunk = chunk.substring(0, splitPoint).trim();
      }
    }

    chunks.push(chunk);
    i += (chunkSize - overlap);
    if (i >= text.length && chunks[chunks.length - 1] === text.substring(text.length - chunk.length)) {
      // Avoid adding duplicate last chunk if overlap already covers it
      break;
    }
  }

  // Filter out any empty chunks
  return chunks.filter(c => c.trim().length > 0);
};

module.exports = {
  chunkText
};