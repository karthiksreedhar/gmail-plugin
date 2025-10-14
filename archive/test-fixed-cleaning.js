// Test the fixed email cleaning function with the user's examples

// Helper function to clean email response body by removing quoted original content
function cleanResponseBody(emailBody) {
  if (!emailBody || typeof emailBody !== 'string') {
    return emailBody;
  }

  // Find the first instance of "wrote:" in the email
  const wroteIndex = emailBody.indexOf('wrote:');
  
  if (wroteIndex !== -1) {
    // Look backwards from "wrote:" to find the first instance of "On"
    const textBeforeWrote = emailBody.substring(0, wroteIndex);
    const onIndex = textBeforeWrote.lastIndexOf('On ');
    
    if (onIndex !== -1) {
      // Remove everything from "On" onwards
      const cleanedBody = emailBody.substring(0, onIndex).trim();
      console.log('Cleaned email - removed quoted content using "On...wrote:" pattern');
      return cleanedBody;
    }
  }

  // Fallback: try other common quote patterns if "On...wrote:" pattern not found
  const quotePatterns = [
    // Simple "---- Original Message ----" or similar
    /\n\s*-+\s*Original Message\s*-+\s*\n/i,
    // Email client forwarding patterns
    /\n\s*-+\s*Forwarded message\s*-+\s*\n/i,
    // Generic quote markers with ">" at start of lines
    /\n\s*>\s*.+/,
    // Outlook style: "From: [sender] Sent: [date]"
    /\n\s*From:\s*.+?\s*Sent:\s*.+?\n/i
  ];

  let cleanedBody = emailBody;

  // Try each fallback pattern to find where the quoted content starts
  for (const pattern of quotePatterns) {
    const match = cleanedBody.match(pattern);
    if (match) {
      // Split at the quote marker and keep only the part before it
      const quoteStart = match.index;
      cleanedBody = cleanedBody.substring(0, quoteStart).trim();
      console.log('Cleaned email - removed quoted content using fallback pattern');
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

console.log('=== TESTING FIXED EMAIL CLEANING FUNCTION ===\n');

// Test case 1: User's first example
const email1 = `ok im sorry i should have done this earlier, but just tried and it says im
too young? has anyone else been able to get an account?

On Thu, Sep 4, 2025 at 4:29 PM Lydia Chilton 
wrote:

> be sur to check out gemini pro for email. Because we don't want to redo
> anything they do. It will give us a good sense of what to focus on.`;

console.log('=== Test 1: First example ===');
console.log('Original:');
console.log(email1);
console.log('\nCleaned:');
const cleaned1 = cleanResponseBody(email1);
console.log(cleaned1);
console.log('\n' + '='.repeat(60) + '\n');

// Test case 2: User's second example
const email2 = `Hi,

I hope you're doing well! I wanted to reach out to (1) confirm that my
hiring paperwork had been approved and there were no outstanding actions on
my end, and (2) clarify the distribution dates of stipends. I sincerely
appreciate your help and look forward to hearing from you!

Thanks,
Karthik

On Thu, Aug 14, 2025 at 5:09 PM CS Student Payroll <
student-payroll@cs.columbia.edu> wrote:

> Dear Students,
>
> Welcome to Computer Science!
>
> You will soon receive your appointment letter and hiring packet via
> DocuSign.`;

console.log('=== Test 2: Second example ===');
console.log('Original:');
console.log(email2);
console.log('\nCleaned:');
const cleaned2 = cleanResponseBody(email2);
console.log(cleaned2);
console.log('\n' + '='.repeat(60) + '\n');

// Test case 3: Email without quoted content (should remain unchanged)
const email3 = `Hi,

Thanks for your email. I'll get back to you soon.

Best,
Karthik`;

console.log('=== Test 3: Email without quoted content ===');
console.log('Original:');
console.log(email3);
console.log('\nCleaned:');
const cleaned3 = cleanResponseBody(email3);
console.log(cleaned3);
console.log('\n' + '='.repeat(60) + '\n');

console.log('=== SUMMARY ===');
console.log(`Test 1 - Removed ${email1.length - cleaned1.length} characters`);
console.log(`Test 2 - Removed ${email2.length - cleaned2.length} characters`);
console.log(`Test 3 - Removed ${email3.length - cleaned3.length} characters (should be 0)`);
