// src/documentParser.js
const axios = require('axios');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth'); // For .docx parsing

const parsePdf = async (buffer) => {
  const data = await pdfParse(buffer);
  return data.text;
};

const parseDocx = async (buffer) => {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value; // The raw text content
};

const parsePlainText = (buffer) => {
  return buffer.toString('utf8');
};

const getDocumentText = async (documentUrl) => {
  console.log(`[DocumentParser] Downloading document from: ${documentUrl}`);
  const response = await axios.get(documentUrl, { responseType: 'arraybuffer' });
  const buffer = response.data;

  // Determine file type based on content-type header or URL extension
  const contentType = response.headers['content-type'];
  const urlParts = documentUrl.split('.');
  const extension = urlParts[urlParts.length - 1].toLowerCase();

  let text = '';
  if (contentType?.includes('application/pdf') || extension === 'pdf') {
    console.log('[DocumentParser] Parsing PDF...');
    text = await parsePdf(buffer);
  } else if (contentType?.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') || extension === 'docx') {
    console.log('[DocumentParser] Parsing DOCX...');
    text = await parseDocx(buffer);
  } else if (contentType?.includes('text/plain') || extension === 'txt' || extension === 'eml') {
    console.log('[DocumentParser] Parsing Plain Text/Email...');
    text = parsePlainText(buffer);
  } else {
    throw new Error(`Unsupported document type or unable to determine type: ${contentType || extension}`);
  }

  console.log(`[DocumentParser] Document parsed successfully. Extracted text length: ${text.length}`);
  return text;
};

module.exports = {
  getDocumentText
};