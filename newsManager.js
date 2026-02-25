const axios = require('axios');
const Sentiment = require('sentiment');
const sentiment = new Sentiment();
const { log } = require("./logger");

// Base URLs for different news APIs
const NEWS_API_BASE_URL = 'https://newsapi.org/v2/everything';
const NEWSDATA_IO_BASE_URL = 'https://newsdata.io/api/1/news';
const THENEWSAPI_COM_BASE_URL = 'https://api.thenewsapi.com/v1/news/all';
// Removed CRYPTOCURRENCY_CV_BASE_URL as it blocks bots
const THEGUARDIAN_API_BASE_URL = 'https://content.guardianapis.com/search';

// API Keys from environment variables
const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const NEWSDATA_IO_API_KEY = process.env.NEWSDATA_IO_API_KEY;
const THENEWSAPI_COM_API_KEY = process.env.THENEWSAPI_COM_API_KEY;
const THEGUARDIAN_API_KEY = process.env.THEGUARDIAN_API_KEY;

/**
 * Fetches news articles from NewsAPI.org.
 * Requires NEWSAPI_KEY to be set in .env.
 * @returns {Array} An array of article objects with title, description, and content.
 */
async function fetchNewsFromNewsAPI() {
  if (!NEWSAPI_KEY) {
    log("NEWSAPI_KEY not set. Skipping NewsAPI.org fetch.");
    return [];
  }
  try {
    const options = {
      method: 'GET',
      url: NEWS_API_BASE_URL,
      params: {
        q: 'cryptocurrency',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 10, // Fetch up to 10 articles
        apiKey: NEWSAPI_KEY
      }
    };
    const response = await axios.request(options);
    log("Fetched news from NewsAPI.org");
    return response.data.articles.map(article => ({
      title: article.title,
      description: article.description,
      content: article.content
    }));
  } catch (error) {
    log(`ERROR fetching from NewsAPI.org: ${error.message}. Response data: ${error.response ? JSON.stringify(error.response.data) : 'N/A'}`);
    return [];
  }
}

/**
 * Fetches news articles from NewsData.io.
 * Requires NEWSDATA_IO_API_KEY to be set in .env.
 * @returns {Array} An array of article objects with title, description, and content.
 */
async function fetchNewsFromNewsDataIO() {
  if (!NEWSDATA_IO_API_KEY) {
    log("NEWSDATA_IO_API_KEY not set. Skipping NewsData.io fetch.");
    return [];
  }
  try {
    const options = {
      method: 'GET',
      url: NEWSDATA_IO_BASE_URL,
      params: {
        q: 'cryptocurrency',
        language: 'en',
        apikey: NEWSDATA_IO_API_KEY
      }
    };
    const response = await axios.request(options);
    log("Fetched news from NewsData.io");
    // NewsData.io articles are in response.data.results
    return response.data.results.map(article => ({
      title: article.title,
      description: article.description,
      content: article.content
    }));
  } catch (error) {
    log(`ERROR fetching from NewsData.io: ${error.message}. Response data: ${error.response ? JSON.stringify(error.response.data) : 'N/A'}`);
    return [];
  }
}

/**
 * Fetches news articles from TheNewsAPI.com.
 * Requires THENEWSAPI_COM_API_KEY to be set in .env.
 * @returns {Array} An array of article objects with title, description, and content.
 */
async function fetchNewsFromTheNewsAPI() {
  if (!THENEWSAPI_COM_API_KEY) {
    log("THENEWSAPI_COM_API_KEY not set. Skipping TheNewsAPI.com fetch.");
    return [];
  }
  try {
    const options = {
      method: 'GET',
      url: THENEWSAPI_COM_BASE_URL,
      params: {
        search: 'cryptocurrency',
        language: 'en',
        api_token: THENEWSAPI_COM_API_KEY,
        limit: 10 // Fetch up to 10 articles
      }
    };
    const response = await axios.request(options);
    log("Fetched news from TheNewsAPI.com");
    // TheNewsAPI.com articles are in response.data.data
    return response.data.data.map(article => ({
      title: article.title,
      description: article.snippet, // TheNewsAPI often provides a snippet
      content: article.url // Use URL as content if full content isn't available
    }));
  } catch (error) {
    log(`ERROR fetching from TheNewsAPI.com: ${error.message}. Response data: ${error.response ? JSON.stringify(error.response.data) : 'N/A'}`);
    return [];
  }
}

/**
 * Fetches news articles from The Guardian Open Platform.
 * Requires THEGUARDIAN_API_KEY to be set in .env.
 * @returns {Array} An array of article objects with title, description, and content.
 */
async function fetchNewsFromTheGuardian() {
  if (!THEGUARDIAN_API_KEY) {
    log("THEGUARDIAN_API_KEY not set. Skipping The Guardian fetch.");
    return [];
  }
  try {
    const options = {
      method: 'GET',
      url: THEGUARDIAN_API_BASE_URL,
      params: {
        q: 'cryptocurrency',
        'api-key': THEGUARDIAN_API_KEY,
        'show-fields': 'headline,trailText,bodyText', // Request specific fields
        'page-size': 10 // Fetch up to 10 articles
      }
    };
    const response = await axios.request(options);
    log("Fetched news from The Guardian Open Platform");
    // The Guardian articles are in response.data.response.results
    return response.data.response.results.map(article => ({
      title: article.webTitle,
      description: article.fields?.trailText, // Use trailText as description
      content: article.fields?.bodyText // Use bodyText as content
    }));
  } catch (error) {
    log(`ERROR fetching from The Guardian: ${error.message}. Response data: ${error.response ? JSON.stringify(error.response.data) : 'N/A'}`);
    return [];
  }
}

// Removed fetchNewsFromCryptoCurrencyCV function as it blocks bots

/**
 * Aggregates news from multiple sources, performs sentiment analysis, and returns an average score.
 * Fallback is handled by Promise.allSettled and combining all successful results.
 * @returns {number} The average sentiment score across all fetched articles.
 */
async function getNewsSentiment() {
  let allArticles = [];

  // Use Promise.allSettled to fetch from all sources concurrently.
  // This allows individual API calls to fail without stopping the entire process.
  const results = await Promise.allSettled([
    fetchNewsFromNewsAPI(),
    fetchNewsFromNewsDataIO(),
    fetchNewsFromTheNewsAPI(),
    fetchNewsFromTheGuardian(),
    // Removed fetchNewsFromCryptoCurrencyCV() from here
  ]);

  // Collect articles from all successfully fulfilled promises
  results.forEach(result => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allArticles = allArticles.concat(result.value);
    }
  });

  if (allArticles.length === 0) {
    log("No articles fetched from any source for sentiment analysis. Returning neutral sentiment.");
    return 0; // Return neutral sentiment if no news could be fetched
  }

  let totalScore = 0;
  let analyzedArticlesCount = 0;

  for (const article of allArticles) {
    // Prioritize content, then description, then title for sentiment analysis
    // Ensure there's actual text to analyze
    const textToAnalyze = article.content || article.description || article.title || '';
    if (textToAnalyze.trim().length > 0) {
      const result = sentiment.analyze(textToAnalyze);
      totalScore += result.score;
      analyzedArticlesCount++;
    }
  }

  if (analyzedArticlesCount === 0) {
    log("No suitable text found in fetched articles for sentiment analysis. Returning neutral sentiment.");
    return 0; // Return neutral if no text was suitable for analysis
  }

  const averageSentiment = totalScore / analyzedArticlesCount;
  log(`Aggregated sentiment score from ${analyzedArticlesCount} articles across multiple sources: ${averageSentiment.toFixed(2)}`);
  return averageSentiment;
}

module.exports = { getNewsSentiment };