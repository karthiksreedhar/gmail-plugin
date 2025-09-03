// Check if formatting is being lost in the email cleaning

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

console.log('=== CHECKING FORMATTING ISSUES ===');

// Let's examine the original email structure
console.log('Original email with visible line breaks:');
console.log(JSON.stringify(eypEmail));

// Find where we would cut
const wroteIndex = eypEmail.indexOf('wrote:');
const beforeWrote = eypEmail.substring(0, wroteIndex);
const onIndex = beforeWrote.lastIndexOf('On ');

console.log('\n=== CUT ANALYSIS ===');
console.log('Cut would happen at index:', onIndex);
console.log('Text around cut point:');
console.log('Before cut:', JSON.stringify(eypEmail.substring(onIndex - 50, onIndex)));
console.log('At cut point:', JSON.stringify(eypEmail.substring(onIndex, onIndex + 50)));

// Show what we'd keep
const cleaned = eypEmail.substring(0, onIndex).trim();
console.log('\n=== CLEANED RESULT ===');
console.log('Cleaned text:');
console.log(cleaned);

console.log('\n=== FORMATTING ANALYSIS ===');
console.log('Original has line breaks:', eypEmail.includes('\n'));
console.log('Cleaned has line breaks:', cleaned.includes('\n'));
console.log('Number of line breaks in original:', (eypEmail.match(/\n/g) || []).length);
console.log('Number of line breaks in cleaned:', (cleaned.match(/\n/g) || []).length);

// Check if the issue is that the original email itself lacks proper formatting
console.log('\n=== ORIGINAL EMAIL STRUCTURE ===');
const lines = eypEmail.split('\n');
console.log('Total lines in original:', lines.length);
console.log('First few lines:');
lines.slice(0, 10).forEach((line, i) => {
  console.log(`Line ${i}: "${line}"`);
});

// Check the user's actual content before the cut
const userContent = eypEmail.substring(0, onIndex);
const userLines = userContent.split('\n');
console.log('\n=== USER CONTENT STRUCTURE ===');
console.log('Lines in user content:', userLines.length);
userLines.forEach((line, i) => {
  console.log(`User line ${i}: "${line}"`);
});
