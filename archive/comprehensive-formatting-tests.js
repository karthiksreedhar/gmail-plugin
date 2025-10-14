// Comprehensive testing of formatting preservation with various email types

function cleanResponseBodyWithFormatting(emailBody) {
  if (!emailBody || typeof emailBody !== 'string') {
    return emailBody;
  }

  let cleanedBody = emailBody;

  // Method 1: Remove everything after "On ... wrote:" pattern - find "wrote:" first, then look for "On" before it
  const wroteMatches = [...cleanedBody.matchAll(/wrote:\s*[\s\S]*$/gi)];
  
  for (const wroteMatch of wroteMatches) {
    const wroteIndex = wroteMatch.index;
    const beforeWrote = cleanedBody.substring(0, wroteIndex);
    
    // Find the last occurrence of "On" before "wrote:" (simple approach)
    const onIndex = beforeWrote.lastIndexOf('On ');
    
    if (onIndex !== -1) {
      // Cut everything from "On" onwards
      cleanedBody = cleanedBody.substring(0, onIndex).trim();
      console.log(`Cleaned email - removed quoted content using "On...wrote:" pattern`);
      break;
    }
  }

  // Method 2: Remove lines that start with ">" (quoted text)
  const lines = cleanedBody.split('\n');
  const filteredLines = [];
  let inQuotedSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // If line starts with ">", it's quoted content - skip it
    if (trimmedLine.startsWith('>')) {
      inQuotedSection = true;
      continue;
    }
    
    // If we were in a quoted section and hit a non-quoted line, we're out
    if (inQuotedSection && trimmedLine.length > 0 && !trimmedLine.startsWith('>')) {
      inQuotedSection = false;
    }
    
    // Only keep non-quoted lines
    if (!inQuotedSection) {
      filteredLines.push(line);
    }
  }

  if (filteredLines.length < lines.length) {
    cleanedBody = filteredLines.join('\n').trim();
    console.log(`Cleaned email - removed ${lines.length - filteredLines.length} quoted lines starting with ">"`);
  }

  // Add intelligent formatting to improve readability
  cleanedBody = addIntelligentFormatting(cleanedBody);

  return cleanedBody.trim();
}

function addIntelligentFormatting(text) {
  // If the text is already well-formatted (has multiple line breaks), don't mess with it much
  const lineBreakCount = (text.match(/\n/g) || []).length;
  if (lineBreakCount >= 2) {
    return text; // Already has decent formatting
  }
  
  // For run-on text or poorly formatted text, add intelligent line breaks
  let formatted = text;
  
  // Add line break after greeting patterns
  formatted = formatted.replace(/^(Hi,|Hello,|Hey,|Dear [^,]+,)/i, '$1\n\n');
  
  // Add line breaks before common closing patterns
  formatted = formatted.replace(/(Thanks,|Best,|Regards,|Sincerely,|Best regards,|Kind regards,)\s*([A-Z][a-z]+)$/i, '\n\n$1\n$2');
  
  // Add line breaks after sentence endings followed by capital letters (new sentences)
  formatted = formatted.replace(/([.!?])\s+([A-Z])/g, '$1\n\n$2');
  
  // Add line break after question marks followed by space and capital letter
  formatted = formatted.replace(/(\?)\s+([A-Z])/g, '$1\n\n$2');
  
  // Handle common patterns like "I hope" starting new paragraphs
  formatted = formatted.replace(/\.\s+(I hope|I wanted|I would|I think|I believe|Please|Could you|Would you)/g, '.\n\n$1');
  
  // Handle "Let me know" patterns
  formatted = formatted.replace(/\.\s+(Let me know|Please let me know)/g, '.\n\n$1');
  
  return formatted;
}

// Test cases covering different email scenarios
const testCases = [
  {
    name: "EYP Email (Run-on text)",
    email: `Hi,I woke up under the weather today and just admittedly got up enough to get on my computer - I'm not sure I'll be able to make it to the remaining sessions today either.I'll make sure to check in with a classmate regarding content I miss - but please let me know if there's a way I can make up my attendance for today if needed. Sincerely apologize for the inconvenience but hope that you can understand.Thanks,KarthikOn Aug 25, 2025, at 4:04 PM, Richard Hagen <rh3224@columbia.edu> wrote:Original content here...`
  },
  {
    name: "Short Response",
    email: `Thanks for the update.Best,JohnOn Jan 1, 2025, at 10:00 AM, Jane <jane@example.com> wrote:Original message...`
  },
  {
    name: "Question Email",
    email: `Hi there,Can you please send me the report? I need it by tomorrow.Thanks,AliceOn Dec 1, 2024, at 2:00 PM, Bob <bob@example.com> wrote:Original request...`
  },
  {
    name: "Multi-sentence Response",
    email: `Hello,I received your message about the meeting.I think Tuesday works better for me.Let me know if that's okay with you.Best regards,SarahOn Nov 15, 2024, at 3:30 PM, Mike <mike@example.com> wrote:Meeting request...`
  },
  {
    name: "Already Well-Formatted",
    email: `Hi,

I hope this finds you well.

I wanted to follow up on our conversation yesterday.

Thanks,
David

On Oct 10, 2024, at 1:00 PM, Lisa <lisa@example.com> wrote:
Previous conversation...`
  },
  {
    name: "Quoted Text Email",
    email: `Hi,

Here's my response:

> Can you review this document?
I've reviewed it and it looks good.

> When can we meet?
How about Thursday at 2pm?

Thanks,
Emma

On Sep 5, 2024, at 4:00 PM, Tom <tom@example.com> wrote:
Original questions...`
  },
  {
    name: "No Quoted Content",
    email: `Hello,I just wanted to reach out about the project status.Everything is going well and we should be done by Friday.Thanks,Chris`
  },
  {
    name: "Complex Formatting",
    email: `Hi team,I wanted to update everyone on the progress.We've completed phase 1 successfully.Phase 2 will start next week.Please let me know if you have any questions.I think we're on track for the deadline.Best,PatrickOn Aug 1, 2024, at 9:00 AM, Team Lead <lead@company.com> wrote:Status update request...`
  }
];

console.log('=== COMPREHENSIVE FORMATTING TESTS ===\n');

testCases.forEach((testCase, index) => {
  console.log(`--- TEST ${index + 1}: ${testCase.name} ---`);
  console.log('Original:');
  console.log(testCase.email);
  console.log('\nCleaned with formatting:');
  
  const cleaned = cleanResponseBodyWithFormatting(testCase.email);
  console.log(cleaned);
  
  console.log('\nStats:');
  console.log(`- Original length: ${testCase.email.length}`);
  console.log(`- Cleaned length: ${cleaned.length}`);
  console.log(`- Reduction: ${Math.round((1 - cleaned.length / testCase.email.length) * 100)}%`);
  console.log(`- Line breaks: ${(cleaned.match(/\n/g) || []).length}`);
  console.log(`- Readable: ${cleaned.includes('\n') ? 'YES' : 'NO'}`);
  
  // Check if content is preserved
  const hasGreeting = cleaned.match(/^(Hi,|Hello,|Hey,|Dear)/i);
  const hasClosing = cleaned.match(/(Thanks,|Best,|Regards,|Sincerely,)/i);
  console.log(`- Has greeting: ${hasGreeting ? 'YES' : 'NO'}`);
  console.log(`- Has closing: ${hasClosing ? 'YES' : 'NO'}`);
  
  console.log('\n' + '='.repeat(60) + '\n');
});

// Edge case testing
console.log('=== EDGE CASE TESTS ===\n');

const edgeCases = [
  {
    name: "Empty string",
    email: ""
  },
  {
    name: "Only whitespace",
    email: "   \n  \t  "
  },
  {
    name: "No punctuation",
    email: "Hi this is a test with no punctuation at all just words Thanks John"
  },
  {
    name: "All caps",
    email: "HI THERE I HOPE YOU ARE WELL THANKS JOHN"
  },
  {
    name: "Multiple wrote patterns",
    email: `Hi, thanks for the info. On Jan 1, someone wrote: something. But I wanted to respond. Thanks, John On Dec 1, 2024, at 1:00 PM, Jane <jane@example.com> wrote: Original message`
  }
];

edgeCases.forEach((testCase, index) => {
  console.log(`--- EDGE CASE ${index + 1}: ${testCase.name} ---`);
  console.log('Input:', JSON.stringify(testCase.email));
  
  try {
    const result = cleanResponseBodyWithFormatting(testCase.email);
    console.log('Output:', JSON.stringify(result));
    console.log('Success: YES');
  } catch (error) {
    console.log('Error:', error.message);
    console.log('Success: NO');
  }
  
  console.log('\n' + '-'.repeat(40) + '\n');
});
