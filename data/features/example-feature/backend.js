/**
 * Example Feature Backend
 * Demonstrates how to create a server-side feature plugin
 */

module.exports = {
  /**
   * Initialize the feature
   * Called when the server starts
   * 
   * @param {Object} context - Feature context with access to server resources
   * @param {Express} context.app - Express app instance
   * @param {Function} context.getUserDoc - Get user document from MongoDB
   * @param {Function} context.setUserDoc - Set user document in MongoDB
   * @param {Function} context.openai - OpenAI client instance
   * @param {Function} context.getCurrentUser - Get current user email
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, openai, getCurrentUser } = context;
    
    console.log('Example Feature: Initializing...');
    
    // Register custom API endpoint
    app.get('/api/example-feature/hello', (req, res) => {
      res.json({
        success: true,
        message: 'Hello from Example Feature!',
        user: getCurrentUser()
      });
    });
    
    // Example: Get feature data for current user
    app.get('/api/example-feature/data', async (req, res) => {
      try {
        const currentUser = getCurrentUser();
        const doc = await getUserDoc('example_feature_data', currentUser);
        
        res.json({
          success: true,
          data: doc || { items: [] }
        });
      } catch (error) {
        console.error('Example Feature: Error getting data:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get feature data'
        });
      }
    });
    
    // Example: Save feature data for current user
    app.post('/api/example-feature/data', async (req, res) => {
      try {
        const currentUser = getCurrentUser();
        const { items } = req.body;
        
        await setUserDoc('example_feature_data', currentUser, {
          items: items || [],
          updatedAt: new Date().toISOString()
        });
        
        res.json({
          success: true,
          message: 'Data saved successfully'
        });
      } catch (error) {
        console.error('Example Feature: Error saving data:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to save feature data'
        });
      }
    });
    
    // Example: AI-powered endpoint using OpenAI
    app.post('/api/example-feature/analyze', async (req, res) => {
      try {
        const { text } = req.body;
        
        if (!text) {
          return res.status(400).json({
            success: false,
            error: 'Text is required'
          });
        }
        
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: `Analyze this text and provide a brief summary: ${text}`
          }],
          max_tokens: 150
        });
        
        res.json({
          success: true,
          analysis: completion.choices[0].message.content
        });
      } catch (error) {
        console.error('Example Feature: Error analyzing text:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to analyze text'
        });
      }
    });
    
    console.log('Example Feature: Initialized successfully');
  }
};
