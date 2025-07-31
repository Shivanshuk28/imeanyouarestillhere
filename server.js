require('dotenv').config();
const express = require('express');
const authMiddleware = require('./src/authMiddleware');
const ragSystem = require('./src/ragSystem');
const config = require('./src/config');

const app = express();
app.use(express.json());
//ee
// Apply authentication middleware to the specific route
app.post('/api/v1/hackrx/run', authMiddleware, async (req, res) => {
  let attempts = 0;
  const MAX_RETRIES = config.MAX_RETRIES;
  const INITIAL_RETRY_DELAY_MS = config.INITIAL_RETRY_DELAY_MS;

  while (attempts < MAX_RETRIES) {
    try {
      let { documents, questions } = req.body;

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

      console.log(`[Attempt ${attempts + 1}] Processing document: ${documents}`);

      // Process the request using the RAG system
      const answers = await ragSystem.processAndAnswer(documents, questions);

      console.log('Successfully processed and answered questions.');
      return res.json({ answers });

    } catch (err) {
      const errorDetail = err.response?.data || err.message;
      console.error(`[Attempt ${attempts + 1}] Request failed. Error details:`, errorDetail);

      const isRetryable = (
        err.name === 'AxiosError' && // Check if it's an Axios error
        (!err.response || err.response.status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') // 5xx errors, network errors, timeouts
      );

      if (isRetryable && attempts < MAX_RETRIES - 1) {
        attempts++;
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts - 1); // Exponential backoff
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Max retries reached or non-retryable error. Sending error response.');
        return res.status(500).json({
          error: 'An internal server error occurred.',
          detail: errorDetail.error?.message || errorDetail // More specific error message from Gemini if available
        });
      }
    }
  }
});

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Service is running.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/v1/hackrx/run`);
});

// Export app for testing purposes (e.g., if you were to use supertest)
module.exports = app;