/**
 * Student Quick Reply Backend
 * Provides API endpoints for logging quick reply responses
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser } = context;
    
    console.log('Student Quick Reply: Initializing backend...');
    
    /**
     * Record a quick reply response
     * POST /api/student-quick-reply/record
     * Body: { emailId, senderName, response: 'yes'|'no', timestamp }
     */
    app.post('/api/student-quick-reply/record', async (req, res) => {
      try {
        const currentUser = getCurrentUser();
        const { emailId, senderName, response, timestamp } = req.body;
        
        if (!emailId || !response) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: emailId and response'
          });
        }
        
        // Validate response value
        if (response !== 'yes' && response !== 'no') {
          return res.status(400).json({
            success: false,
            error: 'Response must be either "yes" or "no"'
          });
        }
        
        // Get existing response history for this user
        const doc = await getUserDoc('student_quick_reply_data', currentUser);
        const history = (doc && Array.isArray(doc.responses)) ? doc.responses : [];
        
        // Add new response
        const newResponse = {
          id: `${emailId}-${Date.now()}`,
          emailId,
          senderName: senderName || 'Unknown Sender',
          response,
          timestamp: timestamp || new Date().toISOString()
        };
        
        history.push(newResponse);
        
        // Save updated history
        await setUserDoc('student_quick_reply_data', currentUser, {
          responses: history,
          lastUpdated: new Date().toISOString()
        });
        
        console.log(`Student Quick Reply: Recorded ${response} for email ${emailId} from ${senderName}`);
        
        res.json({
          success: true,
          message: 'Response recorded successfully',
          response: newResponse
        });
      } catch (error) {
        console.error('Student Quick Reply: Error recording response:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to record response'
        });
      }
    });
    
    /**
     * Get quick reply history
     * GET /api/student-quick-reply/history
     * Optional query params: emailId, limit
     */
    app.get('/api/student-quick-reply/history', async (req, res) => {
      try {
        const currentUser = getCurrentUser();
        const { emailId, limit } = req.query;
        
        // Get response history for this user
        const doc = await getUserDoc('student_quick_reply_data', currentUser);
        let history = (doc && Array.isArray(doc.responses)) ? doc.responses : [];
        
        // Filter by emailId if specified
        if (emailId) {
          history = history.filter(r => r.emailId === emailId);
        }
        
        // Apply limit if specified
        if (limit) {
          const limitNum = parseInt(limit, 10);
          if (Number.isFinite(limitNum) && limitNum > 0) {
            history = history.slice(-limitNum);
          }
        }
        
        // Sort by timestamp (newest first)
        history.sort((a, b) => {
          const dateA = new Date(a.timestamp || 0);
          const dateB = new Date(b.timestamp || 0);
          return dateB - dateA;
        });
        
        res.json({
          success: true,
          responses: history,
          count: history.length
        });
      } catch (error) {
        console.error('Student Quick Reply: Error getting history:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get response history'
        });
      }
    });
    
    /**
     * Delete a specific response
     * DELETE /api/student-quick-reply/response/:responseId
     */
    app.delete('/api/student-quick-reply/response/:responseId', async (req, res) => {
      try {
        const currentUser = getCurrentUser();
        const { responseId } = req.params;
        
        if (!responseId) {
          return res.status(400).json({
            success: false,
            error: 'Response ID is required'
          });
        }
        
        // Get existing response history
        const doc = await getUserDoc('student_quick_reply_data', currentUser);
        const history = (doc && Array.isArray(doc.responses)) ? doc.responses : [];
        
        // Filter out the specified response
        const updated = history.filter(r => r.id !== responseId);
        
        if (updated.length === history.length) {
          return res.status(404).json({
            success: false,
            error: 'Response not found'
          });
        }
        
        // Save updated history
        await setUserDoc('student_quick_reply_data', currentUser, {
          responses: updated,
          lastUpdated: new Date().toISOString()
        });
        
        console.log(`Student Quick Reply: Deleted response ${responseId}`);
        
        res.json({
          success: true,
          message: 'Response deleted successfully'
        });
      } catch (error) {
        console.error('Student Quick Reply: Error deleting response:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete response'
        });
      }
    });
    
    console.log('Student Quick Reply: Backend initialized successfully');
  }
};
