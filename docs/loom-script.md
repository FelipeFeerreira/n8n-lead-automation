# 90-Second Loom Script — n8n Lead Automation

## Screen setup

1. Open the repo in VS Code.
2. Open the terminal at the bottom.
3. Have the n8n workflow editor open in a browser tab (optional demo of import).

## Recording order

| Seconds | Action | What to show |
|---------|--------|--------------|
| 0–10 | Intro | Say who you are and the problem: losing inbound leads between form submission and first contact. |
| 10–25 | Show README flow diagram | Walk through the webhook → validation → email → WhatsApp → CRM steps. |
| 25–50 | Run the simulator | In the terminal run `npm run sim`, then `npm run sim:fail`. Scroll through the structured JSON logs. |
| 50–75 | Show the workflow JSON | Briefly open `workflows/lead-inbound.json` and mention it is importable into n8n 1.x. |
| 75–90 | Close | Mention next steps: plug in real SMTP, WhatsApp API, and CRM credentials. Invite the viewer to reach out. |

## Suggested narration

1. "I built an n8n workflow that catches inbound leads from a form and instantly confirms by email, notifies via WhatsApp, and stores everything in a CRM."
2. "Since I cannot share real credentials in a portfolio repo, I also wrote a local Node simulator that runs the same flow end to end with fake providers, including a WhatsApp failure and email fallback."
3. "The workflow is ready to import into n8n 1.x; you only need to add your SMTP, WhatsApp API token, and CRM endpoint."

## Rules for the recording

- Do not mention fake clients, metrics, or revenue numbers.
- Do not show real API tokens or passwords.
- Keep the tone practical and focused on the automation behavior.
