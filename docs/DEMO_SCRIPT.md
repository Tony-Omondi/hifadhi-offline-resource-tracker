# Demo video script (2 min 45 s)

Record the screen at 1280×800 or larger, with two browser windows side by side: a normal window ("Clinic A") and a private or second-profile window ("Clinic B"). Both open the live HTTPS URL. Seed the sample data first.

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | Clinic A, full app | "This is Hifadhi, a stock tracker for rural clinics and aid points where the signal drops. Everything you see is stored on this device." |
| 0:15–0:45 | Turn on **Work offline** (or switch off Wi-Fi). Add "Amoxicillin 500mg", 200 capsules. Dispense 5 Paracetamol. Open **Sync queue** | "No connection, but I can still add and dispense. Each change becomes an operation with its own ID, queued first in, first out. Here they are, numbered in order." |
| 0:45–1:00 | Reload the page while still offline | "Even a reload works offline. The service worker serves the app, and IndexedDB still has the data and the queue." |
| 1:00–1:20 | Turn **Work offline** off. The queue drains and the badge shows "All synced". Open `/api/records` in a tab | "Back online, the queue replays oldest first, and the server now has exactly these changes." |
| 1:20–1:55 | Both windows offline. A: Bar Soap location "Store room". B, a moment later: "Shelf 4". Bring B online, then A. Open A's **Conflicts** tab | "Two clinics edited the same field offline. The server keeps the later edit on every device, and the app shows what happened. If they had edited different fields, both edits would be kept. Stock movements never conflict: they add up." |
| 1:55–2:25 | A: dispense 1 ORS, then click **Sync, then drop the reply**. The error toast appears and the queue still shows 1. Click **Sync now**. The toast reads "already on server" | "This is the nasty case: the server applied the change but the reply was lost. The phone resends it, the server recognises the operation ID, and it is applied once, not twice." |
| 2:25–2:45 | Terminal: `pytest -v` and `npm test` passing; `curl https://<url>/health` | "Thirty backend tests, twenty-one frontend tests and a real-browser end-to-end test cover ordering, deduplication, conflicts and failure cases. The /health endpoint is live on PrimeCloud." |

Tips: zoom the browser to 110% so the text is readable in the video, and keep the cursor still while you talk.
