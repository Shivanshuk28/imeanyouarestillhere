// src/config.js
module.exports = {
  GEMINI_API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
  GEMINI_QNA_MODEL: 'gemini-1.5-flash', // Optimized for speed and cost
  GEMINI_EMBEDDING_MODEL: 'text-embedding-004', // Google's recommended embedding model
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  CHUNK_SIZE: 1000, // Characters per chunk
  CHUNK_OVERLAP: 100, // Overlap between chunks to maintain context
  TOP_K_CHUNKS: 5, // Number of top relevant chunks to retrieve for context
  MAX_LLM_INPUT_TOKENS: 30000 // Approximate maximum tokens Gemini can handle in context
};