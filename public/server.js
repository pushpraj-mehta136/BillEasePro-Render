const express = require('express');
const { Translate } = require('@google-cloud/translate').v2;
const path = require('path');
require('dotenv').config();

const translate = new Translate({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.post('/api/translate', async (req, res) => {
  try {
    const { text, source, target } = req.body;
    const [translations] = await translate.translate(text, { from: source, to: target });
    res.json({ translations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/languages', async (req, res) => {
  try {
    const [langs] = await translate.getSupportedLanguages();
    res.json({ languages: langs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TransEase running on port ${PORT}`));
