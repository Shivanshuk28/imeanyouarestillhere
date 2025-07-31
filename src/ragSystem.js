// src/ragSystem.js
const axios = require('axios');
const crypto = require('crypto');
const documentParser = require('./documentParser');
const textChunker = require('./textChunker');
const embeddingService = require('./embeddingService');
const pineconeService = require('./pineconeService');
const config = require('./config');

const GEMINI_QNA_API_URL = `${config.GEMINI_API_BASE_URL}${config.GEMINI_QNA_MODEL}:generateContent`;

const estimateTokens = (text) => {
  return Math.ceil(text.length / 4);
};

const getDocumentNamespaceFromUrl = (url) => {
  return crypto.createHash('sha256').update(url).digest('hex');
};

const indexDocument = async (documentUrl, namespace) => {
  console.log(`[RAGSystem - Indexing] Starting indexing for namespace: ${namespace}`);
  const extractedText = await documentParser.getDocumentText(documentUrl);

  const chunks = textChunker.chunkText(
    extractedText,
    config.CHUNK_SIZE,
    config.CHUNK_OVERLAP
  );
  console.log(`[RAGSystem - Indexing] Document chunked into ${chunks.length} parts.`);

  const vectorsToUpsert = [];
  const EMBEDDING_BATCH_SIZE = 25; // Reduce batch size slightly to be safer with free tier embedding limits

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const chunkBatch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const embeddingPromises = chunkBatch.map(chunk => embeddingService.getEmbedding(chunk));
    const embeddings = await Promise.all(embeddingPromises);

    for (let j = 0; j < embeddings.length; j++) {
      if (embeddings[j] && embeddings[j].length === config.EMBEDDING_DIMENSION) {
        vectorsToUpsert.push({
          id: `${namespace}-chunk-${i + j}`,
          values: embeddings[j],
          metadata: { text: chunkBatch[j], original_url: documentUrl, chunk_index: i + j }
        });
      } else {
        console.warn(`[RAGSystem - Indexing] Skipping chunk ${i + j} due to invalid embedding.`);
      }
    }
    // Add a delay between batches of embedding calls to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, config.EMBEDDING_BATCH_DELAY_MS));
  }

  if (vectorsToUpsert.length > 0) {
    await pineconeService.upsertVectors(vectorsToUpsert, namespace);
  } else {
    console.warn(`[RAGSystem - Indexing] No vectors to upsert for namespace: ${namespace}`);
  }
  console.log(`[RAGSystem - Indexing] Document namespace: ${namespace} indexing complete.`);
};

const checkIfDocumentIndexed = async (namespace) => {
  try {
    // Try to query with a dummy vector to see if the namespace has any vectors
    // Using a very small, short query to minimize cost/latency for this check
    const queryResult = await pineconeService.queryVectors(Array(config.EMBEDDING_DIMENSION).fill(0), namespace, 1);
    return queryResult.length > 0;
  } catch (error) {
    if (error.message.includes('No vectors found in namespace') || error.message.includes('INDEX_DOES_NOT_EXIST')) {
      console.log(`[RAGSystem - Check] Namespace ${namespace} not found or empty in Pinecone.`);
      return false;
    }
    console.error(`[RAGSystem - Check] Error checking if document ${namespace} is indexed:`, error.message);
    throw error;
  }
};

const processDocumentAndAnswer = async (documentUrl, questions) => {
  const namespace = getDocumentNamespaceFromUrl(documentUrl);

  const isIndexed = await checkIfDocumentIndexed(namespace);

  if (!isIndexed) {
    console.log(`[RAGSystem] Document ${documentUrl} (namespace: ${namespace}) not yet indexed. Starting indexing process.`);
    await indexDocument(documentUrl, namespace);
    console.log(`[RAGSystem] Indexing complete for ${namespace}. Proceeding to answer questions.`);
  } else {
    console.log(`[RAGSystem] Document ${documentUrl} (namespace: ${namespace}) is already indexed. Retrieving directly.`);
  }

  const allAnswers = [];

  const questionAnswerPromises = questions.map(async (question, index) => { // Added index to apply delay
    console.log(`[RAGSystem - Querying] Answering question: "${question.substring(0, 50)}..." for document namespace: ${namespace}`);

    // Introduce a delay for each concurrent LLM call to prevent rate limiting
    // This will sequence the calls a bit, increasing total time but avoiding 429s
    if (index > 0) { // No need to delay the very first question
      await new Promise(resolve => setTimeout(resolve, config.LLM_QUERY_CONCURRENT_DELAY_MS));
    }


    const queryEmbedding = await embeddingService.getEmbedding(question);

    const retrievedTexts = await pineconeService.queryVectors(
      queryEmbedding,
      namespace,
      config.TOP_K_CHUNKS
    );

    const context = Array.isArray(retrievedTexts) && retrievedTexts.length > 0
      ? retrievedTexts.join('\n\n---\n\n')
      : 'No relevant context found in the provided document for this question.';

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

    const estimatedPromptTokens = estimateTokens(promptText);
    if (estimatedPromptTokens > config.MAX_LLM_INPUT_TOKENS) {
      console.warn(`[RAGSystem - Querying] Prompt for question "${question.substring(0, 30)}..." is too large (${estimatedPromptTokens} tokens). This may lead to truncated responses or errors.`);
    }

    let answer = 'Error: Could not get an answer.';
    try {
      console.log(`[RAGSystem - Querying] Sending prompt for "${question.substring(0, 30)}..." to Gemini...`);
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
          timeout: 60000
        }
      );
      answer = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer generated.';
      console.log(`[RAGSystem - Querying] Received answer for "${question.substring(0, 30)}...".`);
    } catch (llmError) {
      console.error(`[RAGSystem - Querying] Error calling Gemini for question "${question}":`, llmError.response?.data || llmError.message);
      answer = `Error getting answer: ${llmError.response?.data?.error?.message || llmError.message}`;
    }
    return answer.replace(/^\d+\.\s*/, '').trim();
  });

  const rawAnswers = await Promise.all(questionAnswerPromises);
  allAnswers.push(...rawAnswers);
  return allAnswers;
};

module.exports = {
  processDocumentAndAnswer
};