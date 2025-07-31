// src/vectorStore.js

class InMemoryVectorStore {
  constructor(dimension) {
    if (!dimension || dimension <= 0) {
      throw new Error("Dimension must be a positive number.");
    }
    this.dimension = dimension;
    this.documents = []; // Store original document chunks
    this.embeddings = []; // Store embeddings
    this.nextId = 0;
    console.log(`[VectorStore] Initialized with dimension: ${dimension}`);
  }

  // Calculate cosine similarity between two vectors
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  async addDocument(chunk, embedding) {
    if (!embedding || embedding.length !== this.dimension) {
      throw new Error(`Invalid embedding dimension. Expected ${this.dimension}, got ${embedding ? embedding.length : 'none'}.`);
    }
    const id = this.nextId++;
    this.embeddings[id] = embedding;
    this.documents[id] = chunk; // Store chunk by its ID
    // console.log(`[VectorStore] Added chunk ${id}, length: ${chunk.length}`);
  }

  async search(queryEmbedding, k) {
    if (!queryEmbedding || queryEmbedding.length !== this.dimension) {
      throw new Error(`Invalid query embedding dimension. Expected ${this.dimension}, got ${queryEmbedding ? queryEmbedding.length : 'none'}.`);
    }

    if (this.documents.length === 0) {
      console.warn('[VectorStore] Search performed on an empty index.');
      return [];
    }

    // Calculate similarities for all stored embeddings
    const similarities = [];
    for (let i = 0; i < this.embeddings.length; i++) {
      if (this.embeddings[i] && this.documents[i]) {
        const similarity = this.cosineSimilarity(queryEmbedding, this.embeddings[i]);
        similarities.push({
          id: i,
          similarity: similarity,
          document: this.documents[i]
        });
      }
    }

    // Sort by similarity (highest first) and take top k
    similarities.sort((a, b) => b.similarity - a.similarity);
    const numResults = Math.min(k, similarities.length);
    const topResults = similarities.slice(0, numResults);

    const retrievedChunks = topResults.map(result => result.document);
    // console.log(`[VectorStore] Retrieved ${retrievedChunks.length} chunks for query.`);
    return retrievedChunks;
  }

  // Optional: Clear the store (useful if you're re-indexing per request)
  clear() {
    this.documents = [];
    this.embeddings = [];
    this.nextId = 0;
    console.log('[VectorStore] Store cleared.');
  }

  getCurrentCount() {
    return this.documents.filter(doc => doc !== undefined).length;
  }

  getCurrentDimension() {
    return this.dimension;
  }
}

// Since Gemini embeddings are typically 768 dimensions, we'll initialize with that.
const EMBEDDING_DIMENSION = 768;
const globalVectorStore = new InMemoryVectorStore(EMBEDDING_DIMENSION);

module.exports = {
  getVectorStore: () => globalVectorStore // Export a singleton instance
};