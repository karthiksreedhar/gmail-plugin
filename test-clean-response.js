const fs = require('fs');
const path = require('path');

// Import the cleanResponseBody function from server.js
function cleanResponseBody(emailBody) {
  if (!emailBody || typeof emailBody !== 'string') {
    return emailBody;
  }

  // Common patterns that indicate the start of quoted content
  const quotePatterns = [
    // Gmail style: "On [date] at [time], [sender] wrote:"
    /\n\s*On .+? at .+?, .+? wrote:\s*\n/i,
    // Outlook style: "From: [sender] Sent: [date]"
    /\n\s*From:\s*.+?\s*Sent:\s*.+?\n/i,
    // Generic "On [date], [sender] wrote:"
    /\n\s*On .+?, .+? wrote:\s*\n/i,
    // Simple "---- Original Message ----" or similar
    /\n\s*-+\s*Original Message\s*-+\s*\n/i,
    // Email client forwarding patterns
    /\n\s*-+\s*Forwarded message\s*-+\s*\n/i,
    // Generic quote markers with ">" at start of lines
    /\n\s*>\s*.+/,
    // Date/time patterns that often precede quoted content
    /\n\s*\d{1,2}\/\d{1,2}\/\d{4}.+?wrote:\s*\n/i
  ];

  let cleanedBody = emailBody;

  // Try each pattern to find where the quoted content starts
  for (const pattern of quotePatterns) {
    const match = cleanedBody.match(pattern);
    if (match) {
      // Split at the quote marker and keep only the part before it
      const quoteStart = match.index;
      cleanedBody = cleanedBody.substring(0, quoteStart).trim();
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
const testCases = [
  {
    name: "Gmail style quote",
    input: `Thanks for your email. I'll get back to you soon.

Best regards,
Karthik

On Mon, Dec 4, 2023 at 2:30 PM, sender@example.com wrote:
> This is the original email content that should be removed.
> It contains multiple lines of quoted content.`,
    expected: `Thanks for your email. I'll get back to you soon.

Best regards,
Karthik`
  },
  {
    name: "Outlook style quote",
    input: `I agree with your proposal.

Thanks,
Karthik

From: sender@example.com
Sent: Monday, December 4, 2023 2:30 PM
To: karthik@example.com
Subject: Original Email

This is the original email content.`,
    expected: `I agree with your proposal.

Thanks,
Karthik`
  },
  {
    name: "Simple date format",
    input: `Perfect, let's schedule that meeting.

Best,
Karthik

On December 4, 2023, sender@example.com wrote:
Original email content here.`,
    expected: `Perfect, let's schedule that meeting.

Best,
Karthik`
  },
  {
    name: "No quoted content",
    input: `This is a simple email with no quoted content.

Thanks,
Karthik`,
    expected: `This is a simple email with no quoted content.

Thanks,
Karthik`
  }
];

console.log('Testing cleanResponseBody function...\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log('Input:', JSON.stringify(testCase.input));
  
  const result = cleanResponseBody(testCase.input);
  console.log('Output:', JSON.stringify(result));
  console.log('Expected:', JSON.stringify(testCase.expected));
  
  const passed = result === testCase.expected;
  console.log('Status:', passed ? '✅ PASSED' : '❌ FAILED');
  
  if (!passed) {
    console.log('Difference:');
    console.log('  Result length:', result.length);
    console.log('  Expected length:', testCase.expected.length);
  }
  
  console.log('---\n');
});

// Test with actual email thread data
console.log('Testing with actual email thread data...\n');

try {
  const emailThreadsPath = path.join(__dirname, 'data', 'ks4190@columbia.edu', 'email-threads.json');
  if (fs.existsSync(emailThreadsPath)) {
    const emailThreadsData = JSON.parse(fs.readFileSync(emailThreadsPath, 'utf8'));
    const threads = emailThreadsData.threads || [];
    
    console.log(`Found ${threads.length} email threads to test`);
    
    threads.slice(0, 3).forEach((thread, index) => {
      console.log(`\nThread ${index + 1}: ${thread.subject}`);
      console.log('Original body length:', thread.body ? thread.body.length : 0);
      
      if (thread.body) {
        const cleaned = cleanResponseBody(thread.body);
        console.log('Cleaned body length:', cleaned.length);
        console.log('Reduction:', thread.body.length - cleaned.length, 'characters');
        
        // Show first 200 characters of cleaned body
        console.log('Cleaned preview:', JSON.stringify(cleaned.substring(0, 200) + (cleaned.length > 200 ? '...' : '')));
      }
    });
  } else {
    console.log('No email threads file found for testing');
  }
} catch (error) {
  console.error('Error testing with actual data:', error.message);
}
