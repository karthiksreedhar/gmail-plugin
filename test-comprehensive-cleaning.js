// Test the comprehensive email cleaning function with real examples
function cleanResponseBody(emailBody) {
  if (!emailBody || typeof emailBody !== 'string') {
    return emailBody;
  }

  let cleanedBody = emailBody;

  // Method 1: Remove everything after "On ... wrote:" pattern (handles various formats)
  const onWrotePatterns = [
    /\n\s*On\s+.*?wrote:\s*[\s\S]*$/i,  // Standard "On ... wrote:"
    /On\s+.*?wrote:\s*[\s\S]*$/i,       // "On ... wrote:" at start of line
    /\n\s*On\s+.*?<.*?>.*?wrote:\s*[\s\S]*$/i  // "On ... <email> wrote:"
  ];

  for (const pattern of onWrotePatterns) {
    const match = cleanedBody.match(pattern);
    if (match) {
      const quoteStart = match.index;
      cleanedBody = cleanedBody.substring(0, quoteStart).trim();
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

// Test cases based on your real examples
const testEmails = [
  {
    name: "Example #1 - EYP Email",
    body: `Hi,I woke up under the weather today and just admittedly got up enough to get on my computer - I'm not sure I'll be able to make it to the remaining sessions today either.I'll make sure to check in with a classmate regarding content I miss - but please let me know if there's a way I can make up my attendance for today if needed. Sincerely apologize for the inconvenience but hope that you can understand.Thanks,KarthikOn Aug 25, 2025, at 4:04 PM, Richard Hagen <rh3224@columbia.edu> wrote:﻿Dear Karthik        ,  
Thank you for joining us today for the first day of Engineering Your Ph.D. (EYP) 2025! We hope the sessions gave you a strong start to your doctoral journey and introduced you to the people and resources that will support you along the way.
As promised, attached are PDF versions of today's presentations for your reference.Tomorrow's Schedule – Tuesday, August 26
Location: Carleton Commons (Mudd, 4th floor)
11:00 – 11:15 AM – Welcome and Brief Overview11:15 – 12:15 PM – CTL: Essentials of Teaching12:15 – 1:00 PM – Lunch 1:00 – 2:00 PM – SEAS TA Panel2:00 – 3:00 PM – Inclusion and BelongingLooking Ahead to Thursday

We will close EYP with a Toast Reception on Thursday, August 28, from 1:00 – 3:00 PM in Carleton Commons, a chance to gather together and celebrate the start of your Ph.D. journey.

In addition, we are planning a Thursday evening social event. More details will follow soon. Stay tuned!
We look forward to seeing you back tomorrow as we continue with sessions on teaching, the TA experience, and building a sense of belonging within the Columbia Engineering community.
Best regards,Richard Hagen, Ph.D. (He/Him)Assistant Director, Graduate Student AffairsEngineering Student AffairsColumbia Engineering --Unsubscribe
<EYP_StudentFunding,I9.pdf><EYP Academic Registration, Student Funding & Appointment.pdf><EYP_2025_Schedule of Events.pdf>`
  },
  {
    name: "Example #2 - Lydia Email with > quotes",
    body: `is there any chance we could still find a time to meet at some point today?
updated the system to allow for feedback on generations, and also changed
prompts/updated backend to use gpt4.0 instead of 3.5 and think it's a lot
better. there are some example generated responses to the email we'd been
working with saved (https://email-twin-frontend.onrender.com/generations)
if you want to take a look (it might take like 2min to load if you open it
and i haven't been using the site right before). main site still at
https://email-twin-frontend.onrender.com/

On Wed, Aug 6, 2025 at 9:00 PM Lydia B. Chilton  wrote:

> Riya (+Karthik) Lydia
>
>
> This event has been canceled and removed from your calendar.
>
> Join Zoom Meeting
> 
> columbiauniversity.zoom.us/j/934...
> 
> ID: 93446650868
> passcode: 651107
> Join by phone(US) +1 309-205-3325 <+13092053325,,93446650868#>
> passcode: 651107
> Join using SIP93446650868@zoomcrc.com
> passcode: 651107
>
> Joining instructions
> 
> Joining notesMeeting host: lc3251@columbia.edu
>
> Join Zoom Meeting:
>
> https://columbiauniversity.zoom.us/j/93446650868?pwd=lcDaYxoghFqQVlR41Ox6u5v3YOmaOO.1&jst=2
> 
> WhenThursday Aug 7, 2025 ⋅ 10am – 10:30am (Eastern Time - New York)
> Guests
> Lydia B. Chilton  - organizer
> Karthik Sreedhar 
> Riya Sahni 
>
> Invitation from Google Calendar 
>
> You are receiving this email because you are subscribed to calendar
> notifications. To stop receiving these emails, go to Calendar settings
> , select this calendar,
> and change "Other notifications".
>
> Forwarding this invitation could allow any recipient to send a response to
> the organizer, be added to the guest list, invite others regardless of
> their own invitation status, or modify your RSVP. Learn more`
  }
];

console.log("Testing comprehensive email cleaning function with real examples:\n");

testEmails.forEach((test, index) => {
  console.log(`=== Test ${index + 1}: ${test.name} ===`);
  console.log("Original length:", test.body.length);
  console.log("Original (first 200 chars):");
  console.log(test.body.substring(0, 200) + "...");
  console.log("\nCleaned:");
  const cleaned = cleanResponseBody(test.body);
  console.log(cleaned);
  console.log("Cleaned length:", cleaned.length);
  console.log("\n" + "=".repeat(80) + "\n");
});
