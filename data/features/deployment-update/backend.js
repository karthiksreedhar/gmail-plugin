/**
 * Deployment Update Backend
 * Exposes latest emails from the "Deployment Infrastructure" category.
 */

module.exports = {
  initialize(context) {
    const {
      app,
      getCurrentUser,
      getUserDoc,
      loadResponseEmails
    } = context;

    app.get('/api/deployment-update/latest', async (req, res) => {
      try {
        const user = getCurrentUser();
        const targetCategory = 'deployment infrastructure';
        const requestedLimit = parseInt(String(req.query?.limit || '25'), 10);
        const limit = Number.isFinite(requestedLimit)
          ? Math.max(1, Math.min(100, requestedLimit))
          : 25;

        let emails = [];
        let source = 'mongo';

        try {
          const doc = await getUserDoc('response_emails', user);
          if (doc && Array.isArray(doc.emails)) {
            emails = doc.emails;
          } else {
            source = 'file';
            emails = loadResponseEmails() || [];
          }
        } catch (_) {
          source = 'file';
          emails = loadResponseEmails() || [];
        }

        const matchesCategory = (email) => {
          const allCategories = Array.isArray(email?.categories) && email.categories.length
            ? email.categories
            : (email?.category ? [email.category] : []);

          return allCategories.some((c) => String(c || '').trim().toLowerCase() === targetCategory);
        };

        const updates = (Array.isArray(emails) ? emails : [])
          .filter((email) => email && email.id && matchesCategory(email))
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
          .slice(0, limit)
          .map((email) => ({
            id: email.id,
            subject: email.subject || 'No Subject',
            from: email.originalFrom || email.from || 'Unknown Sender',
            date: email.date || null,
            snippet: email.snippet || (email.body ? String(email.body).slice(0, 220) : ''),
            category: 'Deployment Infrastructure'
          }));

        return res.json({
          success: true,
          category: 'Deployment Infrastructure',
          source,
          count: updates.length,
          updates
        });
      } catch (error) {
        console.error('Deployment Update: failed to load latest updates:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to load deployment updates'
        });
      }
    });
  }
};
