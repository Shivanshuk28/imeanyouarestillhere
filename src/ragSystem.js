// src/ragSystem.js (Updated processAndAnswer function)
const axios = require('axios');
const documentParser = require('./documentParser');
const textChunker = require('./textChunker');
const embeddingService = require('./embeddingService');
const { getVectorStore } = require('./vectorStore'); // Ensure this is a singleton or managed properly
const config = require('./config');

const GEMINI_QNA_API_URL = `${config.GEMINI_API_BASE_URL}${config.GEMINI_QNA_MODEL}:generateContent`;

// Helper to estimate token count (very basic, actual LLM tokenizers are more complex)
const estimateTokens = (text) => {
  return Math.ceil(text.length / 4); // Roughly 4 characters per token
};

const processAndAnswer = async (documentUrl, questions) => {
  const extractedText = await documentParser.getDocumentText(documentUrl);

  // Initialize a new vector store for each request for simplicity.
  // *** NOTE: This is the primary bottleneck. For production, you'd index documents once. ***
  const vectorStore = getVectorStore();
  vectorStore.clear(); // Clear previous data if using a global store

  // 1. Chunk the document
  const chunks = textChunker.chunkText(
    extractedText,
    config.CHUNK_SIZE,
    config.CHUNK_OVERLAP
  );
  console.log(`[RAGSystem] Document chunked into ${chunks.length} parts.`);

  // 2. Generate embeddings for all chunks and add to vector store
  // Process embeddings in batches to avoid rate limits and improve efficiency
  const BATCH_SIZE = 10; // Adjust based on API limits and network
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const chunkBatch = chunks.slice(i, i + BATCH_SIZE);
    const embeddingPromises = chunkBatch.map(chunk => embeddingService.getEmbedding(chunk));
    const embeddings = await Promise.all(embeddingPromises); // <--- Parallel embedding within batch

    for (let j = 0; j < embeddings.length; j++) {
      if (embeddings[j] && embeddings[j].length > 0) {
        await vectorStore.addDocument(chunkBatch[j], embeddings[j]);
      } else {
        console.warn(`[RAGSystem] Skipping chunk due to empty or invalid embedding: "${chunkBatch[j].substring(0, 50)}..."`);
      }
    }
    // Small delay to prevent hitting rate limits if many chunks
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log('[RAGSystem] All chunks embedded and added to vector store.');


  // *** OPTIMIZATION: Process questions in parallel ***
  const questionAnswerPromises = questions.map(async (question) => {
    console.log(`[RAGSystem] Answering question: "${question}"`);

    // 3. Embed the question
    const queryEmbedding = await embeddingService.getEmbedding(question);

    // 4. Retrieve relevant chunks
    const relevantChunks = await vectorStore.search(queryEmbedding, config.TOP_K_CHUNKS);

    // Ensure relevantChunks is an array before joining
    const context = Array.isArray(relevantChunks) && relevantChunks.length > 0
      ? relevantChunks.join('\n\n---\n\n')
      : 'No relevant context found in the document.';

    // 5. Prepare prompt for LLM
    const promptText = `**Context from the document:**
---
${context}
---

**Your Task:**
You are an expert assistant. Your goal is to carefully read the provided "Context from the document" and accurately answer the user's question.

**Instructions:**
1. Your answer must be based **exclusively** on the information within the provided document context. Do not use any external knowledge.
2. Answer the question directly and concisely.
3. If the answer to the specific question is not found in the document, you **must** state: "The answer to this question is not found in the provided document."
4. If the question is completely unrelated to the document's content, you **must** state: "This question is outside the scope of the provided document."

**Answer the following question based on the rules above:**
${question}
`;

    // Estimate total tokens for prompt
    const estimatedPromptTokens = estimateTokens(promptText);
    if (estimatedPromptTokens > config.MAX_LLM_INPUT_TOKENS) {
      console.warn(`[RAGSystem] Prompt for question "${question}" is too large (${estimatedPromptTokens} tokens). Truncating or re-evaluating chunking strategy may be needed.`);
      // In a real system, you might refine chunk selection or summarize context here.
      // For now, we'll let the LLM handle potential truncation or error.
    }

    // 6. Call Gemini LLM
    let answer = 'Error: Could not get an answer.';
    try {
      console.log(`[RAGSystem] Sending prompt for "${question.substring(0,30)}..." to Gemini...`);
      const geminiResponse = await axios.post(
        GEMINI_QNA_API_URL,
        {
          contents: [
            {
              parts: [{ text: promptText }]
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': process.env.GEMINI_API_KEY
          },
          timeout: 60000 // 60 seconds timeout for Q&A API call
        }
      );
      answer = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer generated.';
      console.log(`[RAGSystem] Received answer for "${question.substring(0,30)}...".`);
    } catch (llmError) {
      console.error(`[RAGSystem] Error calling Gemini for question "${question}":`, llmError.response?.data || llmError.message);
      answer = `Error getting answer: ${llmError.response?.data?.error?.message || llmError.message}`;
    }
    return answer.replace(/^\d+\.\s*/, '').trim(); // Clean up potential numbering from LLM if it adds it
  });

  const allAnswers = await Promise.all(questionAnswerPromises); // Wait for all questions to be answered
  return allAnswers;
};

module.exports = {
  processAndAnswer
};