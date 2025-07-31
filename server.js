require('dotenv').config();
const express = require('express');
const authMiddleware = require('./src/authMiddleware');
const ragSystem = require('./src/ragSystem'); // Now contains all RAG logic
const config = require('./src/config');
const pineconeService = require('./src/pineconeService'); // Import Pinecone service

const app = express();
app.use(express.json());

// Initialize Pinecone client once on server startup
pineconeService.initPinecone();

// The single unified API endpoint
app.post('/api/v1/hackrx/run', authMiddleware, async (req, res) => {
  let attempts = 0;
  const MAX_RETRIES = config.MAX_RETRIES;
  const INITIAL_RETRY_DELAY_MS = config.INITIAL_RETRY_DELAY_MS;

  while (attempts < MAX_RETRIES) {
    try {
      let { documents, questions } = req.body; // 'documents' is the URL

      if (!documents || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({
          error: 'Invalid input. Please provide a "documents" URL and a non-empty "questions" array.'
        });
      }

      // Ensure URL is properly formatted
      if (!/^https?:\/\//i.test(documents)) {
        documents = 'https://' + documents;
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Google Gemini API key not configured' });
      }

      console.log(`[Attempt ${attempts + 1}] Processing request for document: ${documents}`);

      // The ragSystem now handles the check-then-index/query logic
      const answers = await ragSystem.processDocumentAndAnswer(documents, questions);

      console.log('Successfully processed and answered questions.');
      return res.json({ answers });

    } catch (err) {
      const errorDetail = err.response?.data || err.message;
      console.error(`[Attempt ${attempts + 1}] Request failed. Error details:`, errorDetail);

      const isRetryable = (
        err.name === 'AxiosError' &&
        (!err.response || err.response.status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')
      );

      if (isRetryable && attempts < MAX_RETRIES - 1) {
        attempts++;
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts - 1);
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Max retries reached or non-retryable error. Sending error response.');
        return res.status(500).json({
          error: 'An internal server error occurred.',
          detail: errorDetail.error?.message || errorDetail
        });
      }
    }
  }
});

// Basic health check endpointddd
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Service is running.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API Endpoint: http://localhost:${PORT}/api/v1/hackrx/run`);
});

module.exports = app;