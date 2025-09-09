/* Quick harness to test cleanResponseBody with user-provided examples */

// Copy of the current implementation in server.js
function cleanResponseBody(emailBody) {
  if (typeof emailBody !== 'string' || !emailBody) return emailBody;

  // 1) Normalize line endings & weird spaces often introduced by email clients
  let s = emailBody
    .replace(/\r\n?/g, '\n')                      // CRLF/CR -> LF
    .replace(/[\u00A0\u202F\u2007]/g, ' ')        // NBSP / narrow spaces -> space
    .replace(/[ \t]+\n/g, '\n');                  // trim trailing spaces on lines

  // 2) Aggressive detection of reply header regardless of line breaks:
  // Find "On ... wrote:" anywhere (no line anchors), limited window length.
  let cutIdx = s.length;
  const onWroteRe = /\bOn\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2})[\s\S]{0,400}?\bwrote:\s*/;
  const onWroteMatch = onWroteRe.exec(s);
  if (onWroteMatch) {
    cutIdx = Math.min(cutIdx, onWroteMatch.index);
  } else {
    // Secondary heuristic: locate "wrote:" then back-scan up to 600 chars for "On"
    const lower = s.toLowerCase();
    const wroteIdx = lower.indexOf('wrote:');
    if (wroteIdx !== -1) {
      const windowStart = Math.max(0, wroteIdx - 400);
      const window = s.slice(windowStart, wroteIdx);
      let lastOnInWindow = -1;
      // Case-insensitive search for the last "On" token in the window
      const onGlobal = /\bOn\b/g;
      let m;
      while ((m = onGlobal.exec(window)) !== null) {
        lastOnInWindow = m.index;
      }
      if (lastOnInWindow !== -1) {
        cutIdx = Math.min(cutIdx, windowStart + lastOnInWindow);
      }
    }
  }

  // 3) Other reply/forward headers anywhere (no line anchors)
  const patterns = [
    /From:\s[\s\S]{0,600}?\bSent:\s/i,
    /[\-–—_]{2,}\s*Original Message\s*[\-–—_]{2,}\s*/i,
    /[\-–—_]{2,}\s*Forwarded message\s*[\-–—_]{2,}\s*/i,
    /Begin forwarded message:\s*/i,
    /-{2,}\s*Forwarded Message\s*-{2,}\s*/i,
    // Fallback: presence of two or more quote markers ">" anywhere (single-line safe)
    /(>.+){2,}/
  ];

  for (const re of patterns) {
    const m = re.exec(s);
    if (m && m.index < cutIdx) {
      cutIdx = m.index;
    }
  }

  // Cut at earliest detected header/quote
  s = s.slice(0, cutIdx).trim();

  // 4) Optional: strip signature and mobile footers at the end
  s = s.replace(/(^|\n)-- \n[\s\S]*$/m, '').trim(); // RFC 3676 signature delimiter
  s = s.replace(/\n(?:Sent from my .+|Get Outlook for .+)\s*$/i, '').trim();

  // 5) Collapse excessive blank lines
  s = s.replace(/\n{3,}/g, '\n\n');

  return s;
}

// Examples from the user:
const examples = [
  {
    name: "EXAMPLE #1",
    input: `ok im sorry i should have done this earlier, but just tried and it says im too young? has anyone else been able to get an account? On Thu, Sep 4, 2025 at 4:29 PM Lydia Chilton wrote: > be sur to check out gemini pro for email. Because we don't want to redo > anything they do. It will give us a good sense of what to focus on. > > On Thu, Sep 4, 2025 at 3:13 PM Karthik Sreedhar > wrote: > >> That would be great I’ll redo it! >> >> And Im sorry I just got back home, I’ve been using the system to “check” >> my email the past threeish days but have been severely underestimating how >> many emails I get an hour // should be loading 😭 >> >> But have been keeping a list of ~stuff~ (not sure how else how to >> describe it) I’ve felt are kinda interesting from having used it for about >> a week to respond to stuff, excited to get you setup and see if you >> experience similar things. Today I’ve been (and still am) working on that >> top left menu’s “create new user” function, I’m trying to setup the app to >> make it super easy to add new people so that we can broadly test what is >> there now and figure out how to improve!`,
    want: `ok im sorry i should have done this earlier, but just tried and it says im too young? has anyone else been able to get an account?`
  },
  {
    name: "EXAMPLE #2",
    input: `Hi, I hope you're doing well! I wanted to reach out to (1) confirm that my hiring paperwork had been approved and there were no outstanding actions on my end, and (2) clarify the distribution dates of stipends. I sincerely appreciate your help and look forward to hearing from you! Thanks, Karthik On Thu, Aug 14, 2025 at 5:09 PM CS Student Payroll < student-payroll@cs.columbia.edu> wrote: > Dear Students, > > Welcome to Computer Science! > > You will soon receive your appointment letter and hiring packet via > DocuSign. > > While the packet contains detailed instructions, we want to highlight a > few important steps: > > 1. > > Social Security Number (SSN) > If you need to apply for an SSN, please see the attached instructions. > Because it can take time to receive your Social Security receipt (required > for processing your hiring paperwork), we have prepared the On-Campus > Employer Letter for you in advance (Step 2). These letters are ready for > pickup at the Computer Science Office (Computer Science Building, Suite > 450) Monday–Friday, 9:00 AM–5:00 PM. > > 2. > > I-9 Verification > You must complete both Part I (online) and Part II (in person), as > this step authorizes you to work. Please refer to the attached instructions. > > > Please complete all parts of your hiring paperwork and submit it as soon > as possible, but no later than Friday, August 29, 2025. > > If there are any changes or if you have been approved to receive a > fellowship recently, please let us know as soon as possible so we can > forward you relevant guidance and documentation. > > Please don’t hesitate to let us know if you have any questions by emailing > student-payroll@cs.columbia.edu. We will also be available in person to > answer questions during the PhD Orientation on Monday, August 25, 2025. > > Thank you, > > > Student Payroll > >`,
    want: `Hi, I hope you're doing well! I wanted to reach out to (1) confirm that my hiring paperwork had been approved and there were no outstanding actions on my end, and (2) clarify the distribution dates of stipends. I sincerely appreciate your help and look forward to hearing from you! Thanks, Karthik`
  },
  {
    name: "EXAMPLE #3",
    input: `Thanks so much! Hope everything goes well with your study. On Fri, Sep 5, 2025 at 12:36 PM Anubhav Jangra wrote: > Hi Karthik, > > Thank you so much for participating in our study. I hope you enjoyed the > quiz giving experience. Really appreciate your thoughtful feedback, which > will help us develop better systems moving forward. > > Here is your Amazon gift card link - > https://www.amazon.com/gp/r.html?C=32CVHSUH1WNEZ&M=urn:rtn:msg:2025090515182896de2fd2cf0042e0afcb41bf8c60p0na&R=2YGMI8Z5NEJY0&T=C&U=https%3A%2F%2Fwww.amazon.com%2Fg%2FG89V2F6XX2TG9A%3Fref_%3Dpe_120899690_1025545470_TC0401BT_TC03&H=HSXK2FCJQR6XV7QCLGYEVXYA5AMA&ref_=pe_120899690_1025545470_TC0401BT_TC03 > > > Best regards and thank you, > > Anubhav`,
    want: `Thanks so much! Hope everything goes well with your study.`
  }
];

for (const ex of examples) {
  const got = cleanResponseBody(ex.input);

  // Debug instrumentation to understand cut position
  const norm = ex.input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u202F\u2007]/g, ' ')
    .replace(/[ \t]+\n/g, '\n');

  const onWroteRe = /\bOn\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2})[\s\S]{0,400}?\bwrote:\s*/;
  const onMatch = onWroteRe.exec(norm);
  const wroteIdx = norm.toLowerCase().indexOf('wrote:');
  let backScanIdx = -1;
  if (wroteIdx !== -1) {
    const windowStart = Math.max(0, wroteIdx - 400);
    const window = norm.slice(windowStart, wroteIdx);
    const onGlobal = /\bOn\b/g;
    let m; let last = -1;
    while ((m = onGlobal.exec(window)) !== null) last = m.index;
    if (last !== -1) backScanIdx = windowStart + last;
  }

  // Also find first 'On ' position for reference
  const simpleOnIdx = norm.indexOf(' On ');

  console.log(`\n=== ${ex.name} ===`);
  console.log('GOT:');
  console.log(got);
  console.log('\nWANT:');
  console.log(ex.want);
  console.log('\nMATCH:', got === ex.want);
  console.log('\n--- DEBUG ---');
  console.log('input.length:', ex.input.length, 'norm.length:', norm.length, 'got.length:', got.length);
  console.log('onMatch.index:', onMatch ? onMatch.index : -1, 'wroteIdx:', wroteIdx, 'backScanIdx:', backScanIdx, 'simpleOnIdx:', simpleOnIdx);
  if (onMatch) {
    console.log('Header snippet:', norm.slice(onMatch.index, Math.min(onMatch.index + 120, norm.length)));
  }
}
