// Test the improved "wrote:" first approach for email cleaning

// Helper function to clean email response body by removing quoted original content
function cleanResponseBody(emailBody) {
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

  return cleanedBody.trim();
}

// Test with the EYP email that was being over-cut
const eypEmail = `Hi,I woke up under the weather today and just admittedly got up enough to get on my computer - I'm not sure I'll be able to make it to the remaining sessions today either.I'll make sure to check in with a classmate regarding content I miss - but please let me know if there's a way I can make up my attendance for today if needed. Sincerely apologize for the inconvenience but hope that you can understand.Thanks,KarthikOn Aug 25, 2025, at 4:04 PM, Richard Hagen &lt;rh3224@columbia.edu&gt; wrote:﻿Dear Karthik        ,  
Thank you for joining us today for the first day of Engineering Your Ph.D. (EYP) 2025! We hope the sessions gave you a strong start to your doctoral journey and introduced you to the people and resources that will support you along the way.
As promised, attached are PDF versions of today's presentations for your reference.Tomorrow's Schedule – Tuesday, August 26
Location: Carleton Commons (Mudd, 4th floor)
11:00 – 11:15 AM – Welcome and Brief Overview11:15 – 12:15 PM – CTL: Essentials of Teaching12:15 – 1:00 PM – Lunch 1:00 – 2:00 PM – SEAS TA Panel2:00 – 3:00 PM – Inclusion and BelongingLooking Ahead to Thursday

We will close EYP with a Toast Reception on Thursday, August 28, from 1:00 – 3:00 PM in Carleton Commons, a chance to gather together and celebrate the start of your Ph.D. journey.

In addition, we are planning a Thursday evening social event. More details will follow soon. Stay tuned!
We look forward to seeing you back tomorrow as we continue with sessions on teaching, the TA experience, and building a sense of belonging within the Columbia Engineering community.
Best regards,Richard Hagen, Ph.D. (He/Him)Assistant Director, Graduate Student AffairsEngineering Student AffairsColumbia Engineering --Unsubscribe
&lt;EYP_StudentFunding,I9.pdf&gt;&lt;EYP Academic Registration, Student Funding &amp; Appointment.pdf&gt;&lt;EYP_2025_Schedule of Events.pdf&gt;`;

console.log('=== TESTING IMPROVED PATTERN ===');
console.log('Original email length:', eypEmail.length);
console.log('\nOriginal email:');
console.log(eypEmail);

console.log('\n=== CLEANING EMAIL ===');
const cleaned = cleanResponseBody(eypEmail);

console.log('\nCleaned email length:', cleaned.length);
console.log('\nCleaned email:');
console.log(cleaned);

console.log('\n=== ANALYSIS ===');
console.log('Characters removed:', eypEmail.length - cleaned.length);
console.log('Reduction percentage:', Math.round((1 - cleaned.length / eypEmail.length) * 100) + '%');

// Check if the legitimate content is preserved
const hasLegitimateContent = cleaned.includes("I woke up under the weather") && 
                            cleaned.includes("make up my attendance") &&
                            cleaned.includes("Thanks,Karthik");

console.log('Legitimate content preserved:', hasLegitimateContent ? 'YES ✓' : 'NO ✗');

// Check if quoted content is removed
const hasQuotedContent = cleaned.includes("Dear Karthik") || 
                        cleaned.includes("Thank you for joining us") ||
                        cleaned.includes("Richard Hagen");

console.log('Quoted content removed:', hasQuotedContent ? 'NO ✗' : 'YES ✓');

console.log('\n=== TEST RESULT ===');
if (hasLegitimateContent && !hasQuotedContent) {
  console.log('✅ TEST PASSED: Email cleaned correctly!');
} else {
  console.log('❌ TEST FAILED: Email cleaning needs adjustment');
}
