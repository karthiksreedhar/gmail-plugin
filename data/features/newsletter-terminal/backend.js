/**
 * Newsletter Terminal Backend
 * Provides a Bloomberg Terminal-like interface to preview recent newsletters in the inbox.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser, gmail, searchGmailEmails, getGmailEmail, cleanResponseBody } = context;

    console.log('Newsletter Terminal: Initializing backend...');

    // Route to fetch recent newsletters
    app.get('/api/newsletter-terminal/recent-newsletters', async (req, res) => {
      try {
        const user = getCurrentUser();

        if (!user) {
          return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        const searchQuery = 'category:promotions'; // Adjust query as needed
        const maxResults = 10; // Limit the number of newsletters fetched

        const emailList = await searchGmailEmails(searchQuery, maxResults);

        if (!emailList || emailList.length === 0) {
          return res.json({ success: true, data: [], message: 'No newsletters found.' });
        }

        const newsletterDetails = [];

        for (const email of emailList) {
          try {
            const emailDetails = await getGmailEmail(email.id);

            if (emailDetails) {
              const cleanedBody = await cleanResponseBody(emailDetails.body);

              newsletterDetails.push({
                id: email.id,
                threadId: email.threadId,
                subject: email.subject,
                from: email.from,
                date: email.date,
                snippet: email.snippet,
                body: cleanedBody,
              });
            }
          } catch (emailDetailError) {
            console.error(`Newsletter Terminal: Error fetching details for email ${email.id}:`, emailDetailError);
          }
        }

        res.json({ success: true, data: newsletterDetails });

      } catch (error) {
        console.error('Newsletter Terminal: Error fetching recent newsletters:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch recent newsletters' });
      }
    });

    console.log('Newsletter Terminal: Backend initialized');
  }
};