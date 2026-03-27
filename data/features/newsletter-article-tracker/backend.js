/**
 * Newsletter Article Tracker Backend
 * Allows users to track articles found within their newsletter subscriptions.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser } = context;

    console.log('Newsletter Article Tracker: Initializing backend...');

    // GET - Fetch tracked articles
    app.get('/api/newsletter-article-tracker/articles', async (req, res) => {
      try {
        const user = getCurrentUser();
        const doc = await getUserDoc('newsletter_article_tracker_data', user);
        const articles = doc?.articles || [];

        res.json({
          success: true,
          data: articles
        });
      } catch (error) {
        console.error('Newsletter Article Tracker: Error getting articles:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to load articles'
        });
      }
    });

    // POST - Add a new tracked article
    app.post('/api/newsletter-article-tracker/articles', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { newsletter, articleTitle, articleLink, notes } = req.body;

        if (!newsletter || !articleTitle || !articleLink) {
          return res.status(400).json({
            success: false,
            error: 'Newsletter, article title, and article link are required'
          });
        }

        const doc = await getUserDoc('newsletter_article_tracker_data', user);
        const articles = doc?.articles || [];

        const newArticle = {
          id: Date.now().toString(), // Generate a unique ID
          newsletter,
          articleTitle,
          articleLink,
          notes,
          createdAt: new Date().toISOString()
        };

        articles.push(newArticle);

        await setUserDoc('newsletter_article_tracker_data', user, { articles });

        console.log('Newsletter Article Tracker: Article added successfully');

        res.json({ success: true, message: 'Article added', data: newArticle });
      } catch (error) {
        console.error('Newsletter Article Tracker: Error adding article:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to add article'
        });
      }
    });

    // DELETE - Delete a tracked article
    app.delete('/api/newsletter-article-tracker/articles/:articleId', async (req, res) => {
      try {
        const user = getCurrentUser();
        const articleId = req.params.articleId;

        const doc = await getUserDoc('newsletter_article_tracker_data', user);
        let articles = doc?.articles || [];

        articles = articles.filter(article => article.id !== articleId);

        await setUserDoc('newsletter_article_tracker_data', user, { articles });

        console.log('Newsletter Article Tracker: Article deleted successfully');

        res.json({ success: true, message: 'Article deleted' });
      } catch (error) {
        console.error('Newsletter Article Tracker: Error deleting article:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete article'
        });
      }
    });

    // PUT - Update a tracked article
    app.put('/api/newsletter-article-tracker/articles/:articleId', async (req, res) => {
      try {
        const user = getCurrentUser();
        const articleId = req.params.articleId;
        const { newsletter, articleTitle, articleLink, notes } = req.body;

        const doc = await getUserDoc('newsletter_article_tracker_data', user);
        let articles = doc?.articles || [];

        const articleIndex = articles.findIndex(article => article.id === articleId);

        if (articleIndex === -1) {
          return res.status(404).json({
            success: false,
            error: 'Article not found'
          });
        }

        articles[articleIndex] = {
          ...articles[articleIndex],
          newsletter: newsletter || articles[articleIndex].newsletter,
          articleTitle: articleTitle || articles[articleIndex].articleTitle,
          articleLink: articleLink || articles[articleIndex].articleLink,
          notes: notes || articles[articleIndex].notes,
          updatedAt: new Date().toISOString()
        };

        await setUserDoc('newsletter_article_tracker_data', user, { articles });

        console.log('Newsletter Article Tracker: Article updated successfully');

        res.json({ success: true, message: 'Article updated', data: articles[articleIndex] });
      } catch (error) {
        console.error('Newsletter Article Tracker: Error updating article:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update article'
        });
      }
    });

    console.log('Newsletter Article Tracker: Backend initialized');
  }
};