// src/embeddingService.js
const axios = require('axios');
const config = require('./config');

const GEMINI_EMBEDDING_API_URL = `${config.GEMINI_API_BASE_URL}${config.GEMINI_EMBEDDING_MODEL}:embedContent`;

const getEmbedding = async (text) => {
  if (!text || text.trim().length === 0) {
    console.warn('[EmbeddingService] Attempted to get embedding for empty text.');
    return []; // Return an empty array for empty text
  }

  try {
    const response = await axios.post(
      GEMINI_EMBEDDING_API_URL,
      {
        model: config.GEMINI_EMBEDDING_MODEL,
        content: {
          parts: [{ text: text }]
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': process.env.GEMINI_API_KEY
        },
        timeout: 30000 // 30 seconds timeout for embedding call
      }
    );

    const embedding = response.data?.embedding?.values;
    if (!embedding) {
      throw new Error('No embedding values received from API.');
    }
    return embedding;
  } catch (error) {
    console.error(`[EmbeddingService] Error getting embedding for text (first 50 chars): "${text.substring(0, 50)}..."`, error.response?.data || error.message);
    throw new Error(`Failed to get embedding: ${error.response?.data?.error?.message || error.message}`);
  }
};

module.exports = {
  getEmbedding
};