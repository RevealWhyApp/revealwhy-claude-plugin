---
name: eye-tracking-study
description: "Run a webcam eye-tracking study on a page with Eye tracking (beta, free): set it up, get one participant link per person, then read measured gaze back with its quality bands. Use when: eye-track participants, eye tracking study, where do people look, did they see the button, gaze heatmap, attention on checkout, webcam study, \"eye-track 10 participants on my checkout\"."
---

# Eye-tracking study (beta, free)

Measured webcam gaze from real participants who agreed to it. Eye tracking (beta, free) is included on the paid
plans; a project member switches it on in RevealWhy (**Settings → Eye tracking**). You cannot switch it on.

## Set up

1. `get_eye_tracking_status`. Go on only when `eyeTracking.available` is true. Otherwise tell the user the missing
   step from `reason`, and stop:
   - `not_entitled`: it is included on the paid plans (Settings → Plan and usage);
   - `not_enabled`: a project member turns it on in Settings → Eye tracking;
   - `not_ready`: temporarily unavailable; try later.
2. Ask who the participants are. Only **members of the public** (`general_public`) or **the site's own customers
   or users** (`customers`). If they are the user's employees, contractors or students, do not create the study:
   say this tool will not create it, because eye-tracking studies are for visitors and customers.
3. Check the site lets the browser use the camera on the study pages, before creating anything: its
   Content-Security-Policy must allow RevealWhy's eye-tracking service, and its Permissions-Policy must not block the
   camera (`camera=(self)` or no camera rule). The New Study screen checks this; this path does not. Without it every
   participant fails (`csp_blocked` or `camera_blocked_by_policy`). Tell the user what to change if you can't confirm it.
4. `create_gaze_study` with a name, the start page (`start_url`) and the task in one or two sentences, e.g.
   "eye-track 10 participants on my checkout": start on the checkout page, task "Buy any tent and stop at the
   payment step". It always requires the camera.
5. `create_participant_links` with the study id, `count` (one link per person) and `domains`: an array of 1 to 20
   site domains the study runs on (the start URL's host, e.g. `["shop.example.com"]`).
6. Hand the user the links and these three things, word for word where quoted:
   - put in the recruitment message, before anyone signs up: **"This study uses your camera (eye tracking)."**;
   - participants see one consent screen first; anyone who says no does not take part and nothing is recorded;
     the camera image never leaves their device;
   - it works best on a laptop or desktop in Chrome; phones and tablets are a beta.

## Read the results (after people have taken part)

1. `get_gaze_quality` for the study: how many participants have usable gaze (status and quality band). Say this
   number first; a participant whose gaze failed is not evidence.
2. `get_gaze_heatmap` for the page with the study id (`study_id`): this study's heatmap and its per-element metrics
   (time to first fixation, dwell, revisits), each with its band.
3. `get_gaze_metrics` for the page only when the user wants every study on that page together: it takes no study id
   and pools every participant of all studies on the page. Say so when you quote it.

## Honesty rules

- It is **measured** gaze, never predicted attention. Do not mix it with attention predictions.
- Quote the band with every number: trustworthy, directional or not enough data. "Not enough data" and an
  `abstain` with its reason are answers to pass on, not findings to round up.
- Webcam gaze is reliable at the element level, not to the pixel. Talk about elements and areas.
- Mobile participants are left out unless asked for (`include_mobile`), because mobile is a beta.
- Facial expressions are not part of this.

These camera studies are listed by `list_gaze_studies`; they are not the research studies of `create_study` /
`list_studies`.

Related: `cta-attention-audit` for seen-but-not-clicked from visitor behaviour; `cro-audit` for what to fix.
