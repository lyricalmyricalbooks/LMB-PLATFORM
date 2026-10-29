# What Colophon asks Google for, and why

Google reviews a sign-in screen before more than 100 people can use it. This page is what the review asks for: each
permission Colophon asks for, why nothing narrower works, and a script for the screen recording. The code keeps this
page honest: `google/verification.test.js` fails when a permission in `google/endpoints.js` has no row here, when a
row here is not in the code, or when a permission Google calls **restricted** appears (a restricted permission needs a
yearly outside security assessment; none is asked for).

Sources, read 29 October 2026: Google's pages on sensitive-permission review
(developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) and restricted
permissions (…/restricted-scope-verification), the Gmail permissions page (sending is "sensitive"; reading, composing,
modifying and full access are "restricted") and the Drive permissions page (the "files this app made" permission is
not sensitive). Google does not publish the class of the other permissions on any page; it shows it in the Cloud
console when a permission is added. **Julian: read the label there and write it in the last column** (about 1 December).

## Two rounds

- **Launch** (the first review): sign-in basics, Analytics, Search Console, Google Shopping, email sending and the
  Drive folder. These carry the "all in on Google" promise.
- **Later** (a second review, once the first is approved): YouTube, Calendar, Business Profile and Ads. They are off
  at launch (`GOOGLE_LATER_EXTRAS`), so the first review asks for as few permissions as possible.

## The permissions

| Permission | Round | Why Colophon needs it | Why nothing narrower works | Google's label (read in the console) |
| --- | --- | --- | --- | --- |
| `openid`, `email` | launch | Know which Google account the press signed in with | These are the sign-in basics | |
| `https://www.googleapis.com/auth/analytics.edit` | launch | Create the shop's Analytics property and website stream | The read-only permission cannot create a property | |
| `https://www.googleapis.com/auth/analytics.manage.users` | launch | Give the shop's reporting account Viewer on that property | Google's access-binding call names this one as required | |
| `https://www.googleapis.com/auth/webmasters` | launch | Add the shop's website to Search Console and submit its sitemap | The read-only permission cannot add a site or submit a sitemap | |
| `https://www.googleapis.com/auth/siteverification` | launch | Prove the press owns the website, and add the press as an owner | The Search Console API has no owner calls | |
| `https://www.googleapis.com/auth/content` | launch | Send the shop's products to Google Shopping | It is the only permission the Merchant API accepts for product data | |
| `https://www.googleapis.com/auth/gmail.send` | launch (behind its switch) | Send the shop's order emails from the press's own address | Send-only: it cannot read the inbox. Sending is "sensitive", not restricted | |
| `https://www.googleapis.com/auth/drive.file` | launch | Keep the press's backup folder that Colophon itself made | It only reaches files this app created, never the rest of the press's Drive | |
| `https://www.googleapis.com/auth/youtube.readonly` | later | Show the press's own videos on its website | Read-only already | |
| `https://www.googleapis.com/auth/calendar.app.created` | later | Keep an events calendar Colophon made | It only reaches calendars this app created | |
| `https://www.googleapis.com/auth/business.manage` | later | Find the press's Business Profile (nothing on it is changed yet) | The only permission Business Profile offers | |
| `https://www.googleapis.com/auth/adwords` | later | Link the shop's product feed to the press's own Google Ads account | The only permission Google Ads offers | |

## Screen recording (unlisted video Google asks for)

Record one run in a test project, with the web address bar and the client id visible the whole time:

1. Open the platform sign-up page and click **Connect Google** in a test shop's admin.
2. Show Google's Allow page and read the list aloud. Say what each permission does for the press, using the "Why"
   column above.
3. Allow. Show each part finishing in the admin: the Analytics property, the Search Console site, the Shopping feed,
   the email sender and the backup folder.
4. Open Google's account page and show **Disconnect**. Press it in Colophon and show the parts being switched off
   and the press's own Google accounts left alone.
5. Show the privacy page on the same domain and the page that says what Colophon does with Google data.

Google also asks for: a public home page describing the app, a privacy policy on the same domain linked from the
sign-in screen, the domain verified in Search Console by a project owner, and a reason for every permission
(this page). It "typically takes 3 to 5 business days" on one Google page and "10 business days" on another; allow
for the longer one plus a week of questions. Until it is approved only 100 people can ever connect, for the whole life
of the project, so keep test sign-ins on a separate Google project.
