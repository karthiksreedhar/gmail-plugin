/**
 * Response Suggestions Backend
 * Analyzes existing email threads to identify those requiring urgent responses
 */

module.exports = {
  /**
   * Initialize the Response Suggestions feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { 
      app, 
      getUserDoc, 
      setUserDoc, 
      openai, 
      getCurrentUser, 
      loadEmailThreads,
      loadResponseEmails,
      getCurrentUserPaths
    } = context;
    
    console.log('Response Suggestions: Initializing backend...');
    
    /**
     * Analyze email threads and generate response suggestions
     * POST /api/response-suggestions/analyze
     */
    app.post('/api/response-suggestions/analyze', async (req, res) => {
      try {
        console.log('Response Suggestions: Starting email analysis...');
        
        // Load existing email threads from database
        const threads = loadEmailThreads();
        const responseEmails = loadResponseEmails();
        
        if (!threads || threads.length === 0) {
          return res.json({ 
            success: true, 
            suggestions: [],
            message: 'No email threads found to analyze' 
          });
        }
        
        console.log(`Response Suggestions: Analyzing ${threads.length} email threads...`);
        
        // Filter threads that already have recent responses (within last 7 days)
        const currentTime = new Date();
        const sevenDaysAgo = new Date(currentTime.getTime() - (7 * 24 * 60 * 60 * 1000));
        
        const candidateThreads = threads.filter(thread => {
          if (!thread.date) return false;
          
          const threadDate = new Date(thread.date);
          
          // Only consider threads older than 7 days that might need follow-up
          if (threadDate > sevenDaysAgo) return false;
          
          // Check if there's been a recent response in response emails
          const hasRecentResponse = responseEmails.some(email => {
            if (email.subject === thread.subject && email.originalFrom === thread.originalFrom) {
              const emailDate = new Date(email.date);
              return emailDate > sevenDaysAgo;
            }
            return false;
          });
          
          return !hasRecentResponse;
        });
        
        if (candidateThreads.length === 0) {
          return res.json({ 
            success: true, 
            suggestions: [],
            message: 'No threads found that require response suggestions' 
          });
        }
        
        console.log(`Response Suggestions: Found ${candidateThreads.length} candidate threads for analysis`);
        
        // Process threads in smaller batches to avoid LLM token limits
        const maxBatchSize = 10; // Smaller batches for better reliability
        const batches = [];
        
        for (let i = 0; i < candidateThreads.length; i += maxBatchSize) {
          batches.push(candidateThreads.slice(i, i + maxBatchSize));
        }
        
        // Limit to first 5 batches as specified in requirements
        const limitedBatches = batches.slice(0, 5);
        
        console.log(`Response Suggestions: Processing ${limitedBatches.length} batches...`);
        
        const allScoredThreads = [];
        
        // Analyze each batch with OpenAI
        for (let batchIndex = 0; batchIndex < limitedBatches.length; batchIndex++) {
          const batch = limitedBatches[batchIndex];
          console.log(`Response Suggestions: Processing batch ${batchIndex + 1}/${limitedBatches.length} with ${batch.length} threads`);
          
          try {
            const batchResults = await analyzeBatchWithLLM(batch, openai);
            allScoredThreads.push(...batchResults);
          } catch (error) {
            console.error(`Response Suggestions: Error processing batch ${batchIndex + 1}:`, error);
            // Continue with other batches even if one fails
          }
        }
        
        // Fallback: If LLM analysis failed completely, use heuristic approach
        if (allScoredThreads.length === 0) {
          console.log('Response Suggestions: LLM analysis yielded no results, using heuristic fallback...');
          const heuristicSuggestions = getHeuristicSuggestions(candidateThreads);
          allScoredThreads.push(...heuristicSuggestions);
        }
        
        // Sort by urgency score and take top 5
        const topSuggestions = allScoredThreads
          .sort((a, b) => b.urgencyScore - a.urgencyScore)
          .slice(0, 5)
          .map(thread => ({
            id: thread.id,
            subject: thread.subject,
            from: thread.originalFrom || thread.from,
            date: thread.date,
            urgencyScore: thread.urgencyScore,
            justification: thread.justification,
            lastAnalyzed: new Date().toISOString()
          }));
        
        // Store suggestions in MongoDB
        await setUserDoc('response_suggestions', getCurrentUser(), {
          suggestions: topSuggestions,
          lastAnalyzed: new Date().toISOString(),
          totalAnalyzed: candidateThreads.length
        });
        
        console.log(`Response Suggestions: Analysis complete. Found ${topSuggestions.length} urgent suggestions`);
        
        res.json({
          success: true,
          suggestions: topSuggestions,
          totalAnalyzed: candidateThreads.length,
          batchesProcessed: limitedBatches.length
        });
        
      } catch (error) {
        console.error('Response Suggestions: Analysis failed:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to analyze email threads for response suggestions'
        });
      }
    });
    
    /**
     * Get current response suggestions
     * GET /api/response-suggestions/get
     */
    app.get('/api/response-suggestions/get', async (req, res) => {
      try {
        const data = await getUserDoc('response_suggestions', getCurrentUser());
        
        if (!data || !data.suggestions) {
          return res.json({
            success: true,
            suggestions: [],
            lastAnalyzed: null
          });
        }
        
        res.json({
          success: true,
          suggestions: data.suggestions || [],
          lastAnalyzed: data.lastAnalyzed,
          totalAnalyzed: data.totalAnalyzed || 0
        });
        
      } catch (error) {
        console.error('Response Suggestions: Failed to get suggestions:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve response suggestions'
        });
      }
    });
    
    /**
     * Dismiss a response suggestion
     * POST /api/response-suggestions/dismiss/:id
     */
    app.post('/api/response-suggestions/dismiss/:id', async (req, res) => {
      try {
        const suggestionId = req.params.id;
        const data = await getUserDoc('response_suggestions', getCurrentUser());
        
        if (!data || !data.suggestions) {
          return res.json({ success: true, message: 'No suggestions to dismiss' });
        }
        
        // Remove the dismissed suggestion
        const updatedSuggestions = data.suggestions.filter(s => s.id !== suggestionId);
        
        await setUserDoc('response_suggestions', getCurrentUser(), {
          ...data,
          suggestions: updatedSuggestions
        });
        
        console.log(`Response Suggestions: Dismissed suggestion ${suggestionId}`);
        
        res.json({
          success: true,
          message: 'Suggestion dismissed successfully',
          remainingSuggestions: updatedSuggestions.length
        });
        
      } catch (error) {
        console.error('Response Suggestions: Failed to dismiss suggestion:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to dismiss suggestion'
        });
      }
    });
    
    console.log('Response Suggestions: Backend initialized');
  }
};

/**
 * Analyze a batch of email threads using OpenAI LLM
 * @param {Array} threads - Batch of email threads to analyze
 * @param {Object} openai - OpenAI client instance
 * @returns {Array} Threads with urgency scores and justifications
 */
async function analyzeBatchWithLLM(threads, openai) {
  const prompt = `You are an email assistant analyzing email threads to identify which ones require urgent responses. 

For each email thread provided, analyze:
1. How long it's been since the last message
2. Content urgency indicators (deadlines, requests, questions)
3. Sender relationship importance
4. Context suggesting action is needed

Rate each thread on a urgency scale of 1-10 (10 being most urgent) and provide a brief justification.

Email threads to analyze:
${threads.map((thread, index) => `
Thread ${index + 1}:
Subject: ${thread.subject}
From: ${thread.originalFrom || thread.from}
Date: ${thread.date}
Last Message: ${getLastMessageFromThread(thread)}
`).join('\n')}

You must respond with valid JSON in this exact format:
{
  "results": [
    {
      "threadIndex": 0,
      "urgencyScore": 8,
      "justification": "Time-sensitive meeting request from advisor with no response for 2 weeks"
    },
    {
      "threadIndex": 1, 
      "urgencyScore": 6,
      "justification": "Follow-up needed on research collaboration proposal"
    }
  ]
}

Only include threads with urgency score >= 6. Be concise with justifications (max 100 characters).
Return valid JSON only, no other text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1500,
      response_format: { type: "json_object" }
    });

    let analysis = completion.choices[0].message.content;
    console.log(`Response Suggestions: Raw LLM response length: ${analysis ? analysis.length : 0}`);
    
    if (!analysis || analysis.trim() === '') {
      console.error('Response Suggestions: Empty LLM response');
      return [];
    }
    
    // Parse JSON response with better error handling
    let parsedAnalysis;
    try {
      const parsed = JSON.parse(analysis.trim());
      parsedAnalysis = parsed.results || parsed.threads || (Array.isArray(parsed) ? parsed : []);
      
      if (!Array.isArray(parsedAnalysis)) {
        console.error('Response Suggestions: LLM response is not an array:', parsed);
        return [];
      }
    } catch (parseError) {
      console.error('Response Suggestions: Failed to parse LLM response:', parseError);
      console.error('Response Suggestions: Raw response:', analysis);
      
      // Try to extract JSON from markdown code blocks or other formatting
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          parsedAnalysis = parsed.results || parsed.threads || (Array.isArray(parsed) ? parsed : []);
        } catch (retryError) {
          console.error('Response Suggestions: Retry parsing also failed:', retryError);
          return [];
        }
      } else {
        return [];
      }
    }
    
    // Map analysis back to original threads
    const scoredThreads = [];
    for (const result of parsedAnalysis) {
      if (result.threadIndex >= 0 && result.threadIndex < threads.length && result.urgencyScore >= 6) {
        const originalThread = threads[result.threadIndex];
        scoredThreads.push({
          ...originalThread,
          urgencyScore: result.urgencyScore,
          justification: result.justification || 'Requires response based on AI analysis'
        });
      }
    }
    
    console.log(`Response Suggestions: Batch analysis found ${scoredThreads.length} urgent threads`);
    return scoredThreads;
    
  } catch (error) {
    console.error('Response Suggestions: LLM analysis failed for batch:', error);
    return [];
  }
}

/**
 * Heuristic fallback when LLM analysis fails
 * @param {Array} threads - Email threads to analyze
 * @returns {Array} Threads with heuristic urgency scores
 */
function getHeuristicSuggestions(threads) {
  const currentTime = new Date();
  
  const scoredThreads = threads.map(thread => {
    let urgencyScore = 6; // Base score for fallback
    let justification = 'Potential follow-up needed';
    
    try {
      const threadDate = new Date(thread.date);
      const daysSince = Math.floor((currentTime - threadDate) / (1000 * 60 * 60 * 24));
      
      const subject = (thread.subject || '').toLowerCase();
      const from = (thread.originalFrom || thread.from || '').toLowerCase();
      
      // Score based on days since last activity
      if (daysSince > 30) {
        urgencyScore += 2;
        justification = `No response for ${daysSince} days`;
      } else if (daysSince > 14) {
        urgencyScore += 1;
        justification = `${daysSince} days without follow-up`;
      }
      
      // Boost score for important senders
      if (from.includes('chilton') || from.includes('lydia')) {
        urgencyScore += 2;
        justification = 'Important sender - advisor communication';
      }
      
      // Boost score for urgent keywords in subject
      const urgentKeywords = ['urgent', 'deadline', 'asap', 'important', 'meeting', 'response needed', 'follow up'];
      if (urgentKeywords.some(keyword => subject.includes(keyword))) {
        urgencyScore += 1;
        justification = 'Subject indicates urgency';
      }
      
      // Boost score for research/academic content
      if (subject.includes('research') || subject.includes('paper') || subject.includes('project')) {
        urgencyScore += 1;
        justification = 'Research-related communication';
      }
      
    } catch (error) {
      console.error('Response Suggestions: Error in heuristic analysis:', error);
    }
    
    return {
      ...thread,
      urgencyScore: Math.min(urgencyScore, 10), // Cap at 10
      justification
    };
  });
  
  // Return only threads with score >= 6, sorted by score
  return scoredThreads
    .filter(thread => thread.urgencyScore >= 6)
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 10); // Return up to 10 for the top 5 selection
}

/**
 * Extract the last message content from a thread for analysis
 * @param {Object} thread - Email thread object
 * @returns {string} Last message content or summary
 */
function getLastMessageFromThread(thread) {
  if (thread.messages && thread.messages.length > 0) {
    const lastMessage = thread.messages[thread.messages.length - 1];
    const content = lastMessage.body || thread.body || 'No content available';
    return content.substring(0, 300) + (content.length > 300 ? '...' : '');
  }
  
  return thread.body || thread.snippet || 'No content available';
}
