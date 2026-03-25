/**
 * Job Application Tracker Backend
 * Extracts company, role, and application status from emails in the 'job applications' category and displays them in a structured list.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser, invokeGemini, getGeminiModel } = context;

    console.log('Job Application Tracker: Initializing backend...');

    // GET - Fetch job application data
    app.get('/api/job-application-tracker/applications', async (req, res) => {
      try {
        const user = getCurrentUser();
        const doc = await getUserDoc('job_application_tracker_data', user);
        const applications = doc?.applications || [];

        res.json({ success: true, data: applications });
      } catch (error) {
        console.error('Job Application Tracker: Error getting applications:', error);
        res.status(500).json({ success: false, error: 'Failed to load applications' });
      }
    });

    // POST - Refresh job application data by analyzing emails
    app.post('/api/job-application-tracker/refresh', async (req, res) => {
      try {
        const user = getCurrentUser();

        // 1. Get all emails in the 'job applications' category
        const doc = await getUserDoc('priority_emails', user);
        const allEmails = doc?.emails || [];
        const jobApplicationEmails = allEmails.filter(
          (email) => (email.category || email._cat) === 'job applications'
        );

        if (jobApplicationEmails.length === 0) {
          return res.json({ success: true, data: [], message: 'No job application emails found.' });
        }

        // 2. Extract information using Gemini
        const task = `Extract the following information from each email:
        - Company name
        - Role applied for
        - Current application status (e.g., applied, interview scheduled, rejected, offer received)
        Return the data as a JSON array of objects, where each object has the keys "company", "role", and "status". If any information is not found, set the value to null.`;

        async function processEmailsWithAI(emails, invokeGemini, getGeminiModel, task) {
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

        const aiProcessingResult = await processEmailsWithAI(jobApplicationEmails, invokeGemini, getGeminiModel, task);

        // 3. Parse the results and save to the database
        let allParsedApplications = [];
        aiProcessingResult.results.forEach(batchResult => {
          if (batchResult.result) {
            try {
              const parsedApplications = JSON.parse(batchResult.result);
              if (Array.isArray(parsedApplications)) {
                allParsedApplications = allParsedApplications.concat(parsedApplications);
              } else {
                console.warn("Job Application Tracker: Gemini returned non-array result, skipping.");
              }
            } catch (parseError) {
              console.error("Job Application Tracker: Error parsing Gemini response:", parseError);
            }
          } else if (batchResult.error) {
            console.error("Job Application Tracker: Batch error:", batchResult.error);
          }
        });

        await setUserDoc('job_application_tracker_data', user, {
          applications: allParsedApplications,
          updatedAt: new Date().toISOString(),
        });

        console.log('Job Application Tracker: Applications refreshed successfully');

        res.json({ success: true, data: allParsedApplications, message: 'Applications refreshed' });
      } catch (error) {
        console.error('Job Application Tracker: Error refreshing applications:', error);
        res.status(500).json({ success: false, error: 'Failed to refresh applications' });
      }
    });

    console.log('Job Application Tracker: Backend initialized');
  },
};