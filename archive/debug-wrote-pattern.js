// Debug the "wrote:" pattern matching

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

console.log('=== DEBUGGING WROTE PATTERN ===');

// Find all "wrote:" occurrences
const wroteMatches = [...eypEmail.matchAll(/wrote:/gi)];
console.log('Found', wroteMatches.length, '"wrote:" matches');

wroteMatches.forEach((match, index) => {
  console.log(`\n--- Match ${index + 1} ---`);
  console.log('Index:', match.index);
  
  // Show context around the match
  const start = Math.max(0, match.index - 100);
  const end = Math.min(eypEmail.length, match.index + 100);
  const context = eypEmail.substring(start, end);
  console.log('Context around "wrote:":');
  console.log(context);
  
  // Get text before "wrote:"
  const beforeWrote = eypEmail.substring(0, match.index);
  console.log('\nLast 200 chars before "wrote:":');
  console.log(beforeWrote.slice(-200));
  
  // Test our patterns
  const onPatterns = [
    { name: 'Pattern 1: \\n\\s*On\\s+[^:]*$', regex: /\n\s*On\s+[^:]*$/i },
    { name: 'Pattern 2: ^On\\s+[^:]*$', regex: /^On\s+[^:]*$/i },
    { name: 'Pattern 3: \\n\\s*On\\s+.*?<.*?>\\s*[^:]*$', regex: /\n\s*On\s+.*?<.*?>\s*[^:]*$/i }
  ];
  
  console.log('\nTesting patterns against text before "wrote:":');
  onPatterns.forEach(pattern => {
    const match = beforeWrote.match(pattern.regex);
    console.log(`${pattern.name}: ${match ? 'MATCH' : 'NO MATCH'}`);
    if (match) {
      console.log('  Matched text:', JSON.stringify(match[0]));
      console.log('  Match index:', match.index);
    }
  });
});

// Let's also try a simpler approach - find the exact text we want to match
console.log('\n=== ANALYZING THE SPECIFIC TEXT ===');
const wroteIndex = eypEmail.indexOf('wrote:');
if (wroteIndex !== -1) {
  const beforeWrote = eypEmail.substring(0, wroteIndex);
  console.log('Text immediately before "wrote:":');
  console.log(JSON.stringify(beforeWrote.slice(-50)));
  
  // Look for the "On Aug 25, 2025, at 4:04 PM, Richard Hagen" part
  const onIndex = beforeWrote.lastIndexOf('On Aug');
  if (onIndex !== -1) {
    console.log('\nFound "On Aug" at index:', onIndex);
    console.log('Text from "On Aug" to "wrote:":');
    console.log(JSON.stringify(eypEmail.substring(onIndex, wroteIndex + 6)));
  }
}
