const axios = require("axios");
const Sentiment = require("sentiment");
const sentiment = new Sentiment();
const { log } = require("./logger");

const NEWS_API_BASE_URL = "https://newsapi.org/v2/everything";

async function getNewsSentiment() {
  log("Executing getNewsSentiment from c:\\Users\\Tush\\Desktop\\tradingbot\\newsManager.js");
  try {
    const options = {
      method: 'GET',
      url: NEWS_API_BASE_URL,
      params: {
        q: 'cryptocurrency',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 10,
        apiKey: process.env.NEWSAPI_KEY
      }
    };

    const res = await axios.request(options);
    log(`Full News API Response Status: ${res.status}, Status Text: ${res.statusText}`);
    log(`Full News API Response Headers: ${JSON.stringify(res.headers)}`);
    const articles = res.data.articles;
    if (articles && Array.isArray(articles) && articles.length > 0) {
      log("--- News Articles for Sentiment Analysis ---");
      articles.forEach((article, index) => {
        log(`Article ${index + 1}: ${article.title} - ${article.description || 'No description'}`);
      });
      log("------------------------------------------");
    }
    let sentimentScore = 0;

    if (articles && Array.isArray(articles) && articles.length > 0) {
      articles.forEach(a => {
        const result = sentiment.analyze(a.title + " " + (a.description || ""));
        sentimentScore += result.score;
      });
      sentimentScore = sentimentScore / articles.length;
      log(`Calculated News Sentiment Score: ${sentimentScore}`);
      return sentimentScore;
    } else if (articles && Array.isArray(articles) && articles.length === 0) {
      log("News API returned an empty array of articles.");
    } else {
      log("News API response did not contain a valid array of articles.");
    }
    return 0;
  } catch(err) {
    log(`News error calling ${NEWS_API_BASE_URL}: ${err.message}. Full error: ${JSON.stringify(err)}`);
    if (err.response) {
      log(`News API Error Response Data: ${JSON.stringify(err.response.data)}`);
      log(`News API Error Response Status: ${err.response.status}`);
    }
    return 0;
  }
}

module.exports = { getNewsSentiment };