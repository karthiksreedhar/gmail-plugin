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

    function extractDeploymentUpdateText(subjectRaw) {
      let s = String(subjectRaw || '').trim();
      if (!s) return 'No Subject';

      // Remove common email prefixes and bracketed tags.
      s = s
        .replace(/^\s*(re|fwd?|fw)\s*:\s*/i, '')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // If subject includes "Deployment Infrastructure", keep the most specific
      // tail segment after common separators.
      const hasDeploymentInfra = /deployment\s+infrastructure/i.test(s);
      if (hasDeploymentInfra) {
        const split = s.split(/\s[-:|]\s/);
        if (split.length > 1) {
          const best = split[split.length - 1].trim();
          if (best && !/deployment\s+infrastructure/i.test(best)) {
            return best;
          }
        }
      }

      // Generic cleanup for "Update:"-style subjects.
      s = s
        .replace(/^\s*deployment\s+infrastructure\s*[-:|]\s*/i, '')
        .replace(/^\s*update\s*[-:]\s*/i, '')
        .trim();

      return s || String(subjectRaw || '').trim() || 'No Subject';
    }

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
            date: email.date || null,
            updateText: extractDeploymentUpdateText(email.subject || ''),
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
