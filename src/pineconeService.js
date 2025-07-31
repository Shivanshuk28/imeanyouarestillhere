// src/pineconeService.js
const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('./config');

let pinecone;
let pineconeIndex;

const initPinecone = () => {
  console.log('Attempting to initialize Pinecone...');
  console.log('PINECONE_API_KEY in config:', config.PINECONE_API_KEY ? 'Set' : 'NOT SET');
  console.log('PINECONE_ENVIRONMENT in config:', config.PINECONE_ENVIRONMENT ? 'Set' : 'NOT SET');
  console.log('PINECONE_INDEX_NAME in config:', config.PINECONE_INDEX_NAME ? 'Set' : 'NOT SET');

  if (!config.PINECONE_API_KEY || !config.PINECONE_INDEX_NAME) {
    console.error('CRITICAL: Pinecone API Key or Index Name are NOT configured. Please check your .env file.');
    return;
  }

  try {
    pinecone = new Pinecone({
      apiKey: config.PINECONE_API_KEY,
    });
    pineconeIndex = pinecone.index(config.PINECONE_INDEX_NAME);
    console.log('[PineconeService] Pinecone client initialized successfully.');
  } catch (error) {
    console.error('[PineconeService] Failed to initialize Pinecone client. Error details:', error.message);
    if (error.message.includes('No such index')) {
        console.error('Possible reason: Pinecone index name is incorrect or index does not exist in your account/environment.');
    }
  }
};

const upsertVectors = async (vectors, namespace) => {
  if (!pineconeIndex) {
    throw new Error('Pinecone index not initialized.');
  }
  try {
    // === FIX IS HERE ===
    // The .upsert() method expects the 'vectors' array directly,
    // not wrapped inside an object with a 'vectors' property.
    await pineconeIndex.namespace(namespace).upsert(vectors); // <-- Pass 'vectors' directly
    // ===================
    console.log(`[PineconeService] Successfully upserted ${vectors.length} vectors into namespace: ${namespace}`);
  } catch (error) {
    console.error(`[PineconeService] Error upserting vectors into namespace ${namespace}:`, error.message);
    throw new Error(`Pinecone upsert failed: ${error.message}`);
  }
};

const queryVectors = async (queryEmbedding, namespace, topK) => {
  if (!pineconeIndex) {
    throw new Error('Pinecone index not initialized.');
  }
  try {
    const queryResult = await pineconeIndex.namespace(namespace).query({
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true
    });
    console.log(`[PineconeService] Found ${queryResult.matches.length} matches in namespace: ${namespace}`);
    return queryResult.matches.map(match => match.metadata.text);
  } catch (error) {
    console.error(`[PineconeService] Error querying vectors in namespace ${namespace}:`, error.message);
    throw new Error(`Pinecone query failed: ${error.message}`);
  }
};

module.exports = {
  initPinecone,
  upsertVectors,
  queryVectors
};