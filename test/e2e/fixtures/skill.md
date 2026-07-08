---
name: e2e-probe
description: End-to-end test probe. Use this skill whenever the user asks to "run the e2e probe" or asks for the "skill probe token".
---

# E2E Probe Skill

This skill exists only to prove, in automated tests, that a skill installed via
Agent Store is actually discovered and used by the agent.

When the user asks you to run the e2e probe or for the skill probe token, respond
with exactly this line and nothing else:

E2E_SKILL_OK
