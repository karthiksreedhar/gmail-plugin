/**
 * Robotics Talk Highlighter Backend
 * Highlights emails related to robotics talks based on keywords and user-defined rules.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser } = context;

    console.log('Robotics Talk Highlighter: Initializing backend...');

    // Define keywords for robotics talks
    const roboticsKeywords = ['robotics', 'robot', 'automation', 'AI', 'motion planning', 'SLAM', 'computer vision', 'ROS', 'sensors', 'actuators'];

    // API endpoint to trigger email highlighting
    app.post('/api/robotics-talk-highlighter/highlight-emails', async (req, res) => {
      try {
        const userEmail = getCurrentUser();
        if (!userEmail) {
          return res.status(400).json({ success: false, error: 'User email not found' });
        }

        // Get all priority emails from MongoDB
        const doc = await getUserDoc('priority_emails', userEmail);
        const allEmails = doc?.emails || [];

        const highlightedEmails = allEmails.map(email => {
          const subject = email.subject.toLowerCase();
          const body = email.body.toLowerCase();

          const isRoboticsTalk = roboticsKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword));

          if (isRoboticsTalk) {
            return { ...email, isRoboticsTalk: true };
          } else {
            return email;
          }
        });

        // Save the updated emails back to MongoDB
        await setUserDoc('priority_emails', userEmail, { emails: highlightedEmails });

        console.log('Robotics Talk Highlighter: Emails highlighted successfully');
        res.json({ success: true, message: 'Emails highlighted successfully' });

      } catch (error) {
        console.error('Robotics Talk Highlighter: Error highlighting emails:', error);
        res.status(500).json({ success: false, error: 'Failed to highlight emails' });
      }
    });

    // API endpoint to fetch highlighted emails
    app.get('/api/robotics-talk-highlighter/get-highlighted-emails', async (req, res) => {
      try {
        const userEmail = getCurrentUser();
        if (!userEmail) {
          return res.status(400).json({ success: false, error: 'User email not found' });
        }

        // Get all priority emails from MongoDB
        const doc = await getUserDoc('priority_emails', userEmail);
        const allEmails = doc?.emails || [];

        const highlightedEmails = allEmails.filter(email => email.isRoboticsTalk);

        console.log('Robotics Talk Highlighter: Highlighted emails fetched successfully');
        res.json({ success: true, data: highlightedEmails });

      } catch (error) {
        console.error('Robotics Talk Highlighter: Error fetching highlighted emails:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch highlighted emails' });
      }
    });

    console.log('Robotics Talk Highlighter: Backend initialized');
  }
};