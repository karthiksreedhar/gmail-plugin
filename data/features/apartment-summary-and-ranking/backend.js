/**
 * Apartment Email Summary and Ranking Backend
 * Summarizes apartment listings in the 'Apartments' folder, ranks them by price, and summarizes neighborhood availability.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getCurrentUser, getGeminiModel } = context;

    console.log('Apartment Email Summary and Ranking: Initializing backend...');

    // GET - Fetch apartment summary and ranking
    app.get('/api/apartment-summary-and-ranking/summary', async (req, res) => {
      try {
        const user = getCurrentUser();

        // 1. Get all priority emails from MongoDB
        const doc = await getUserDoc('priority_emails', user);
        const allEmails = doc?.emails || [];

        // 2. Filter emails by category "Apartments"
        const apartmentEmails = allEmails.filter(e => (e.category || e._cat) === 'Apartments');

        if (!apartmentEmails || apartmentEmails.length === 0) {
          return res.json({ success: true, data: { summary: 'No apartment emails found in the Apartments category.' } });
        }

        // 3. Process emails with Gemini to extract apartment details, rank by price, and summarize neighborhood availability
        const task = `Analyze the following apartment listings and extract the price, neighborhood, and any other relevant details. Rank the apartments by price (lowest to highest) and provide a summary of neighborhood availability. Return the results in JSON format.`;

        const processEmailsWithAI = async (emails, invokeGemini, getGeminiModel, task) => {
          const EMAILS_PER_BATCH = 30;
          const MAX_BATCHES = 5;
          const MAX_TOTAL_EMAILS = EMAILS_PER_BATCH * MAX_BATCHES;

          // Limit total emails
          const limitedEmails = emails.slice(0, MAX_TOTAL_EMAILS);

          // Split into batches
          const batches = [];
          for (let i = 0; i < limitedEmails.length; i += EMAILS_PER_BATCH) {
            batches.push(limitedEmails.slice(i, i + EMAILS_PER_BATCH));
          }

          // Limit to MAX_BATCHES
          const batchesToProcess = batches.slice(0, MAX_BATCHES);

          console.log(`Processing ${limitedEmails.length} emails in ${batchesToProcess.length} batches`);

          const allResults = [];

          for (let i = 0; i < batchesToProcess.length; i++) {
            const batch = batchesToProcess[i];
            console.log(`Processing batch ${i + 1}/${batchesToProcess.length} (${batch.length} emails)`);

            try {
              // Prepare email data for prompt (use minimal fields to save tokens)
              const emailSummaries = batch.map(e => ({
                id: e.id,
                subject: e.subject,
                from: e.from || e.originalFrom,
                category: e.category || e._cat,
                snippet: (e.snippet || '').substring(0, 150) // Truncate snippets
              }));

              const response = await invokeGemini({
                model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
                messages: [
                  { role: 'system', content: `You are analyzing emails. ${task}` },
                  { role: 'user', content: JSON.stringify(emailSummaries) }
                ],
                temperature: 0.3,
                maxOutputTokens: 2000
              });

              const result = response.content;
              allResults.push({ batch: i + 1, result, emailCount: batch.length });

            } catch (error) {
              // CRITICAL: Handle token limit errors gracefully
              if (error.code === 'context_length_exceeded' ||
                error.message?.includes('maximum context length') ||
                error.message?.includes('token')) {
                console.error(`Batch ${i + 1} exceeded token limit, trying smaller batch...`);

                // Try with half the batch
                const smallerBatch = batch.slice(0, Math.floor(batch.length / 2));
                try {
                  const emailSummaries = smallerBatch.map(e => ({
                    id: e.id,
                    subject: e.subject,
                    from: e.from || e.originalFrom,
                    category: e.category || e._cat
                    // Omit snippet to save more tokens
                  }));

                  const retryResponse = await invokeGemini({
                    model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
                    messages: [
                      { role: 'system', content: `You are analyzing emails. ${task}` },
                      { role: 'user', content: JSON.stringify(emailSummaries) }
                    ],
                    temperature: 0.3,
                    maxOutputTokens: 1500
                  });

                  allResults.push({
                    batch: i + 1,
                    result: retryResponse.content,
                    emailCount: smallerBatch.length,
                    wasRetried: true
                  });
                } catch (retryError) {
                  console.error(`Batch ${i + 1} failed even with smaller size:`, retryError.message);
                  allResults.push({ batch: i + 1, error: retryError.message, emailCount: 0 });
                }
              } else {
                console.error(`Batch ${i + 1} failed:`, error.message);
                allResults.push({ batch: i + 1, error: error.message, emailCount: 0 });
              }
            }

            // Add delay between batches to avoid rate limits
            if (i < batchesToProcess.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }

          return {
            totalEmails: limitedEmails.length,
            totalBatches: batchesToProcess.length,
            results: allResults,
            successfulBatches: allResults.filter(r => !r.error).length
          };
        }

        const aiResponse = await processEmailsWithAI(apartmentEmails, invokeGemini, getGeminiModel, task);

        // 4. Return the summary and ranking
        res.json({ success: true, data: { summary: aiResponse } });

      } catch (error) {
        console.error('Apartment Email Summary and Ranking: Error getting summary:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('Apartment Email Summary and Ranking: Backend initialized');
  }
};