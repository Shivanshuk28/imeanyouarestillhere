// src/config.js
module.exports = {
  GEMINI_API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
  GEMINI_QNA_MODEL: 'gemini-1.5-flash', // REVERTED TO FLASH FOR FREE TIER RATE LIMITS
  GEMINI_EMBEDDING_MODEL: 'text-embedding-004', // Google's recommended embedding model
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000,
  CHUNK_SIZE: 1500,
  CHUNK_OVERLAP: 150,
  TOP_K_CHUNKS: 7,
  MAX_LLM_INPUT_TOKENS: 30000, // Flash has smaller context window than Pro
  // Delays to prevent hitting API rate limits on free tier
  EMBEDDING_BATCH_DELAY_MS: 250, // Delay between batches of embedding calls
  LLM_QUERY_CONCURRENT_DELAY_MS: 1000, // Delay between *each* concurrent Q&A call to LLM

  // Pinecone Config
  PINECONE_API_KEY: process.env.PINECONE_API_KEY,
  PINECONE_ENVIRONMENT: process.env.PINECONE_ENVIRONMENT,
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,
  EMBEDDING_DIMENSION: 768
};