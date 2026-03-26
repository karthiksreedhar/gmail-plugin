/**
 * Document Thread History Backend
 * Displays a history of PDF documents from email threads within the 'document' folder,
 * creating a dedicated 'Gmail Drive Space' for easy document retrieval and version control.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser, gmail, searchGmailEmails } = context;

    console.log('Document Thread History: Initializing backend...');

    // GET - Fetch document thread history
    app.get('/api/document-thread-history/documents', async (req, res) => {
      try {
        const user = getCurrentUser();

        // Search for emails in the "document" folder with attachments
        const query = 'in:document has:attachment filename:pdf';
        const maxResults = 50; // Limit the number of emails to retrieve

        const emails = await searchGmailEmails(query, maxResults);

        const documentList = [];

        for (const email of emails) {
          const emailData = await context.getGmailEmail(email.id);

          if (emailData && emailData.payload && emailData.payload.parts) {
            for (const part of emailData.payload.parts) {
              if (part.filename && part.filename.endsWith('.pdf') && part.body && part.body.attachmentId) {
                documentList.push({
                  messageId: email.id,
                  threadId: email.threadId,
                  filename: part.filename,
                  attachmentId: part.body.attachmentId,
                  from: emailData.payload.headers.find(h => h.name === 'From')?.value || 'Unknown Sender',
                  date: emailData.payload.headers.find(h => h.name === 'Date')?.value || 'Unknown Date',
                  subject: emailData.payload.headers.find(h => h.name === 'Subject')?.value || 'No Subject',
                });
              }
            }
          }
        }

        res.json({ success: true, data: documentList });
      } catch (error) {
        console.error('Document Thread History: Error fetching documents:', error);
        res.status(500).json({ success: false, error: 'Failed to load document list' });
      }
    });

    // GET - Download a specific document
    app.get('/api/document-thread-history/download/:messageId/:attachmentId', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { messageId, attachmentId } = req.params;

        const gmailClient = await context.gmail();

        const response = await gmailClient.users.messages.attachments.get({
          userId: 'me',
          messageId: messageId,
          id: attachmentId,
        });

        const attachmentData = response.data;

        if (!attachmentData || !attachmentData.data) {
          return res.status(404).json({ success: false, error: 'Attachment not found' });
        }

        const decodedData = Buffer.from(attachmentData.data, 'base64');

        // Set appropriate headers for file download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="document.pdf"`); // You might want to fetch the actual filename

        // Send the file data
        res.send(decodedData);

      } catch (error) {
        console.error('Document Thread History: Error downloading document:', error);
        res.status(500).json({ success: false, error: 'Failed to download document' });
      }
    });

    console.log('Document Thread History: Backend initialized');
  }
};