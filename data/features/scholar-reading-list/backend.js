/**
 * Scholar Reading List Backend
 * Creates a reading list from Google Scholar articles, summarizing key takeaways for efficient skimming.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getCurrentUser, getGeminiModel } = context;

    console.log('Scholar Reading List: Initializing backend...');

    // GET - Fetch reading list
    app.get('/api/scholar-reading-list/reading-list', async (req, res) => {
      try {
        const user = getCurrentUser();
        const doc = await getUserDoc('scholar_reading_list', user);
        const readingList = doc?.readingList || [];

        res.json({ success: true, data: readingList });
      } catch (error) {
        console.error('Scholar Reading List: Error getting reading list:', error);
        res.status(500).json({ success: false, error: 'Failed to load reading list' });
      }
    });

    // POST - Add article to reading list
    app.post('/api/scholar-reading-list/add-article', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { article } = req.body;

        if (!article) {
          return res.status(400).json({ success: false, error: 'Article is required' });
        }

        const doc = await getUserDoc('scholar_reading_list', user);
        const readingList = doc?.readingList || [];

        // Check if article already exists in the reading list
        const articleExists = readingList.some(item => item.title === article.title && item.link === article.link);
        if (articleExists) {
          return res.status(400).json({ success: false, error: 'Article already exists in reading list' });
        }

        readingList.push(article);

        await setUserDoc('scholar_reading_list', user, { readingList });

        console.log('Scholar Reading List: Article added to reading list');

        res.json({ success: true, message: 'Article added to reading list' });
      } catch (error) {
        console.error('Scholar Reading List: Error adding article:', error);
        res.status(500).json({ success: false, error: 'Failed to add article to reading list' });
      }
    });

    // POST - Remove article from reading list
    app.post('/api/scholar-reading-list/remove-article', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { article } = req.body;

        if (!article) {
          return res.status(400).json({ success: false, error: 'Article is required' });
        }

        const doc = await getUserDoc('scholar_reading_list', user);
        let readingList = doc?.readingList || [];

        readingList = readingList.filter(item => !(item.title === article.title && item.link === article.link));

        await setUserDoc('scholar_reading_list', user, { readingList });

        console.log('Scholar Reading List: Article removed from reading list');

        res.json({ success: true, message: 'Article removed from reading list' });
      } catch (error) {
        console.error('Scholar Reading List: Error removing article:', error);
        res.status(500).json({ success: false, error: 'Failed to remove article from reading list' });
      }
    });

    // POST - Summarize article
    app.post('/api/scholar-reading-list/summarize-article', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { article } = req.body;

        if (!article || !article.abstract) {
          return res.status(400).json({ success: false, error: 'Article and abstract are required' });
        }

        const prompt = `Summarize the following research article abstract in 3 concise bullet points, focusing on the key takeaways and contributions:\n\n${article.abstract}`;

        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            { role: 'system', content: 'You are a research assistant summarizing academic papers.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          maxOutputTokens: 500
        });

        const summary = response.content;

        console.log('Scholar Reading List: Article summarized');

        res.json({ success: true, data: { summary } });
      } catch (error) {
        console.error('Scholar Reading List: Error summarizing article:', error);
        res.status(500).json({ success: false, error: 'Failed to summarize article' });
      }
    });

    console.log('Scholar Reading List: Backend initialized');
  }
};