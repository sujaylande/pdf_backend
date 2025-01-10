const OpenAI = require("openai");
const Document = require("../models/Document");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

const askQuestion = async (req, res) => {
  try {
    const { documentId, question } = req.body;

    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const context = document.textContent;

    const prompt = `
You are an AI assistant. You must answer the question strictly based on the provided document below. Do not include any information outside of this document. If the document does not contain enough information to answer, respond with "Insufficient information in the document." Do not guess or assume anything.

Document:
---
${context}
---

Question: ${question}

Respond in JSON format:
{
  "answer": "<Your Answer>",
  "context": "<Relevant Part of Document or 'Insufficient information'>"
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an AI assistant. Strictly adhere to the provided document." },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.5, 
    });

    const result = JSON.parse(completion.choices[0].message.content.trim());

    const { answer, context: relevantContext } = result;

    document.queryHistory.push({
      question,
      answer,
      context: relevantContext,
    });
    await document.save();

    res.status(200).json({ answer, relevantContext });
  } catch (error) {
    console.error("Error processing the question:", error.message);

    if (error && error.status === 429) {
      return res.status(429).json({
        message: "Rate limit reached. Please try after a few minutes.",
        error: error.message,
      });
    }

    res.status(500).json({ message: "Error processing the question", error: error.message });
  }
};

module.exports = { askQuestion };

