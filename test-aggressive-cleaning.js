// Test the aggressive email cleaning function
function cleanResponseBody(emailBody) {
  if (!emailBody || typeof emailBody !== 'string') {
    return emailBody;
  }

  // Aggressive approach: Look for "On ... wrote:" patterns and remove everything after them
  const aggressiveQuotePatterns = [
    // Most common Gmail pattern: "On [date/time], [name] <email> wrote:"
    /\n\s*On\s+.+?\s+wrote:\s*[\s\S]*$/i,
    // Alternative Gmail pattern: "On [date] at [time], [name] wrote:"
    /\n\s*On\s+.+?\s+at\s+.+?,\s+.+?\s+wrote:\s*[\s\S]*$/i,
    // Simple "On [date], [name] wrote:" pattern
    /\n\s*On\s+.+?,\s+.+?\s+wrote:\s*[\s\S]*$/i,
    // Pattern with email in angle brackets
    /\n\s*On\s+.+?<.+?>\s+wrote:\s*[\s\S]*$/i,
    // Outlook style: "From: [sender] Sent: [date]"
    /\n\s*From:\s*.+?\s*Sent:\s*.+?[\s\S]*$/i,
    // Simple "---- Original Message ----" or similar
    /\n\s*-+\s*Original Message\s*-+\s*[\s\S]*$/i,
    // Email client forwarding patterns
    /\n\s*-+\s*Forwarded message\s*-+\s*[\s\S]*$/i,
    // Generic quote markers with ">" at start of lines (remove entire quoted section)
    /\n\s*>\s*.+[\s\S]*$/,
    // Date/time patterns that often precede quoted content
    /\n\s*\d{1,2}\/\d{1,2}\/\d{4}.+?wrote:\s*[\s\S]*$/i
  ];

  let cleanedBody = emailBody;

  // Try each aggressive pattern to find and remove quoted content
  for (const pattern of aggressiveQuotePatterns) {
    const match = cleanedBody.match(pattern);
    if (match) {
      // Remove everything from the quote marker onwards
      const quoteStart = match.index;
      cleanedBody = cleanedBody.substring(0, quoteStart).trim();
      console.log(`Cleaned email using pattern: ${pattern.source}`);
      break;
    }
  }

  // Additional cleanup: remove excessive whitespace and normalize line breaks
  cleanedBody = cleanedBody
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();

  return cleanedBody;
}

// Test cases
const testEmails = [
  {
    name: "Gmail style with email",
    body: `Thanks for your email. I'll get back to you soon.

Best regards,
John

On Mon, Dec 4, 2023 at 2:30 PM, sender@example.com <sender@example.com> wrote:
> Hi John,
> 
> Can you please review this document?
> 
> Thanks,
> Sender`
  },
  {
    name: "Simple On wrote pattern",
    body: `I agree with your proposal.

Thanks,
John

On December 4, 2023, Jane Doe wrote:
This is the original message that should be removed.`
  },
  {
    name: "Outlook style",
    body: `Here's my response to your question.

Best,
John

From: sender@company.com
Sent: Monday, December 4, 2023 2:30 PM
To: john@example.com
Subject: Question

This is the original email content that should be removed.`
  }
];

console.log("Testing aggressive email cleaning function:\n");

testEmails.forEach((test, index) => {
  console.log(`=== Test ${index + 1}: ${test.name} ===`);
  console.log("Original:");
  console.log(test.body);
  console.log("\nCleaned:");
  const cleaned = cleanResponseBody(test.body);
  console.log(cleaned);
  console.log("\n" + "=".repeat(50) + "\n");
});
