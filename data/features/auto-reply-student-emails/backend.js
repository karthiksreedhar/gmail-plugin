/**
 * Automated Student Email Responses Backend
 * Automatically replies to student emails regarding Slack issues and late submissions/extensions.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getCurrentUser, gmail, gmailAuth, getDisplayNameForUser } = context;

    console.log('Automated Student Email Responses: Initializing backend...');

    // Route to trigger the automated responses (POST request)
    app.post('/api/auto-reply-student-emails/process-emails', async (req, res) => {
      try {
        const userEmail = getCurrentUser();

        if (!userEmail) {
          return res.status(400).json({ success: false, error: 'User email not found.' });
        }

        const studentEmails = await getStudentEmails(userEmail);

        if (!studentEmails || studentEmails.length === 0) {
          return res.json({ success: true, message: 'No student emails found to process.' });
        }

        const results = await processStudentEmails(studentEmails, userEmail, context);

        res.json({ success: true, data: results });

      } catch (error) {
        console.error('Automated Student Email Responses: Error processing emails:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Helper function to get student emails (replace with actual logic)
    async function getStudentEmails(userEmail) {
      try {
        const gmailClient = await gmail();
        const allEmails = await context.searchGmailEmails('from:*.edu', 50);

        return allEmails;
      } catch (error) {
        console.error('Automated Student Email Responses: Error fetching emails:', error);
        throw new Error('Failed to fetch emails: ' + error.message);
      }
    }

    // Helper function to process student emails and send automated responses
    async function processStudentEmails(emails, userEmail, context) {
      const { invokeGemini, getGeminiModel } = context;
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
            from: e.from,
            snippet: (e.snippet || '').substring(0, 150) // Truncate snippets
          }));

          const response = await invokeGemini({
            model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
            messages: [
              { role: 'system', content: 'You are analyzing student emails to determine if they are asking about Slack issues or late submissions/extensions for UI Design 4170. If the email is about Slack issues, respond with "Slack". If the email is about late submissions/extensions, respond with "Extension". If it is about neither, respond with "Other".' },
              { role: 'user', content: JSON.stringify(emailSummaries) }
            ],
            temperature: 0.3,
            maxOutputTokens: 2000
          });

          const result = response.content;
          allResults.push({ batch: i + 1, result, emailCount: batch.length });

          // Process each email in the batch and send replies
          for (const email of batch) {
            const analysisResult = await analyzeEmailContent(email, context);
            if (analysisResult === 'Slack') {
              await sendSlackReply(email, userEmail, context);
            } else if (analysisResult === 'Extension') {
              await sendExtensionReply(email, userEmail, context);
            }
          }

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
                from: e.from,
                // Omit snippet to save more tokens
              }));

              const retryResponse = await invokeGemini({
                model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
                messages: [
                  { role: 'system', content: 'You are analyzing student emails to determine if they are asking about Slack issues or late submissions/extensions for UI Design 4170. If the email is about Slack issues, respond with "Slack". If the email is about late submissions/extensions, respond with "Extension". If it is about neither, respond with "Other".' },
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

              // Process each email in the smaller batch and send replies
              for (const email of smallerBatch) {
                const analysisResult = await analyzeEmailContent(email, context);
                if (analysisResult === 'Slack') {
                  await sendSlackReply(email, userEmail, context);
                } else if (analysisResult === 'Extension') {
                  await sendExtensionReply(email, userEmail, context);
                }
              }

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

    async function analyzeEmailContent(email, context) {
      const { invokeGemini, getGeminiModel } = context;

      try {
        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            { role: 'system', content: 'You are analyzing a student email to determine if it is asking about Slack issues or late submissions/extensions for UI Design 4170. If the email is about Slack issues, respond with "Slack". If the email is about late submissions/extensions, respond with "Extension". If it is about neither, respond with "Other".' },
            { role: 'user', content: `Subject: ${email.subject}\nBody: ${email.snippet}` }
          ],
          temperature: 0.3,
          maxOutputTokens: 50
        });

        return response.content.trim();
      } catch (error) {
        console.error('Automated Student Email Responses: Error analyzing email content:', error);
        return 'Other'; // Default to "Other" in case of error
      }
    }

    // Helper function to send automated reply for Slack issues
    async function sendSlackReply(email, userEmail, context) {
      try {
        const gmailClient = await gmail();
        const displayName = getDisplayNameForUser(userEmail);
        const replyText = `Dear ${email.from.split('<')[0].trim()},\n\nPlease check the announcements page in Courseworks for updates regarding Slack issues.\n\nBest,\n${displayName}`;

        await sendReply(email, replyText, userEmail, gmailClient);
        console.log(`Automated Student Email Responses: Sent Slack reply to ${email.from}`);
      } catch (error) {
        console.error('Automated Student Email Responses: Error sending Slack reply:', error);
      }
    }

    // Helper function to send automated reply for late submissions/extensions
    async function sendExtensionReply(email, userEmail, context) {
      try {
        const gmailClient = await gmail();
        const displayName = getDisplayNameForUser(userEmail);
        const replyText = `Dear ${email.from.split('<')[0].trim()},\n\nThank you for letting me know about your late submission. I have received it.\n\nBest,\n${displayName}`;

        await sendReply(email, replyText, userEmail, gmailClient);
        console.log(`Automated Student Email Responses: Sent extension reply to ${email.from}`);
      } catch (error) {
        console.error('Automated Student Email Responses: Error sending extension reply:', error);
      }
    }

    async function sendReply(email, replyText, userEmail, gmailClient) {
      try {
        const messageId = email.id;
        const threadId = email.threadId;
        const from = userEmail;
        const to = email.from;
        const subject = `Re: ${email.subject}`;
        const references = email.headers ? email.headers['references'] : null;
        const inReplyTo = email.headers ? email.headers['in-reply-to'] : null;

        let messageParts = [
          `From: ${from}`,
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: 7bit',
          'MIME-Version: 1.0',
          `In-Reply-To: ${messageId}`,
          `References: ${messageId}`,
          '',
          replyText
        ];

        if (references) {
          messageParts.splice(7, 0, `References: ${references}`);
        }

        if (inReplyTo) {
          messageParts.splice(7, 0, `In-Reply-To: ${inReplyTo}`);
        }

        const message = messageParts.join('\n');
        const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        await gmailClient.users.messages.send({
          userId: 'me',
          requestBody: {
            threadId: threadId,
            raw: encodedMessage
          }
        });
      } catch (error) {
        console.error('Automated Student Email Responses: Error sending reply via Gmail API:', error);
        throw error;
      }
    }

    console.log('Automated Student Email Responses: Backend initialized');
  }
};