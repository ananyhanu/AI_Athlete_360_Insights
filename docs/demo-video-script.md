# AI Athlete 360 Demo Video Script

Use this guide to produce the required single, continuous `8-12 minute` Android-device screen recording. It is a recording checklist, not a simulated in-app demo. Record from a physical Android phone or tablet, not an emulator.

## Recording Setup

- Launch the installed PWA from the device home screen after visiting it once online, so the application shell and local MediaPipe assets are cached.
- Record the device screen at `1080p` or higher. Export a downloadable `MP4` and keep the final file at or below `500 MB`.
- Keep either a spoken voiceover or captions visible for every segment. Captions should state the action, the selected test, and whether the device is online or in airplane mode.
- Configure `VITE_ASSESSMENT_API_URL` and sign in with a verified coach before recording if the final segment will demonstrate remote synchronization.

## Continuous 8-12 Minute Timeline

| Time | On-screen action | Required narration or caption |
| --- | --- | --- |
| 00:00-00:35 | Launch the installed app and sign in as a coach. | “AI Athlete 360 starts from the coach workspace. Athlete data is encrypted locally.” |
| 00:35-01:35 | Register an athlete, complete required fields, consent, and profile photo. | “I am registering a consented athlete with the required identity and sport information.” |
| 01:35-02:35 | Start **Sit & Reach**. Show protocol guidance, then record a real device-camera clip or upload the supplied Sit & Reach sample. Save, process, display the provisional result, enter the coach-verified metric, and save review. | “This is the protocol-guided capture. AI estimates pose-derived reach provisionally; the coach validates the final measurement.” |
| 02:35-03:35 | Start **Medicine Ball Throw**. Show the required ball/protocol guidance, upload `Medicine Ball Throw — Overhead Backward 720P.mp4`, process, review, and validate. | “The selected recording is encrypted on-device before local pose analysis. This estimate remains provisional.” |
| 03:35-03:50 | Turn on Android airplane mode and visibly show the offline indicator. | “Airplane mode is now enabled. The assessment workflow continues with no internet connection.” |
| 03:50-04:55 | Complete **Standing Vertical Jump** using `Standing Vertical Jump Test 277cm ... 720P.mp4`: guidance, upload, processing, result, coach validation. | “This full assessment is running offline from cached application and model assets. No upload is required for local analysis.” |
| 04:55-06:00 | Complete **Standing Broad Jump** using `Broad Jump to Stick ... 480P.mp4`: guidance, upload, processing, result, coach validation. | “This is the second end-to-end offline test. Its encrypted capture and assessment remain queued on this device.” |
| 06:00-06:50 | Open the assessment report card offline. Show captured tests and download the PDF. | “The report card and PDF export are generated locally while offline. All results remain provisional until coach acceptance.” |
| 06:50-07:20 | Restore connectivity by turning airplane mode off. Open the dashboard and show **Sync pending records**. | “Connectivity is restored. The app initiates encrypted athlete and assessment synchronization.” |
| 07:20-08:15 | Show the sync status and history/report state. | “Pending records are synchronized only after connectivity returns. The audit trail and local records remain available.” |

## Captions and Safety Notes

- Do not state that AI produces official measurements, timing-gate results, or automatic acceptance.
- For 30m Sprint, 4x10m Shuttle Run, Sit-Ups, and Endurance Run, narrate that the coach must enter approved timing/count results; the app deliberately does not infer them from arbitrary video duration.
- Show the sample-video filename before selecting it and show the result screen after processing. This evidences video selection, local analysis, and review.
- Confirm the final file is downloadable. If it exceeds `500 MB`, upload it to a downloadable location such as Google Drive or OneDrive, not a streaming-only YouTube link.