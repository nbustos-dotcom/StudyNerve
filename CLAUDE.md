# StudyNerve AI — Claude Code Instructions

## Daily Review Mode

Trigger: user types "daily review" (or similar).

### What to check, in priority order
1. **Data isolation bugs** — any DB query missing `user_id` filter
2. **Bugs / broken behavior** — logic errors, incorrect API responses
3. **Dead code** — leftover references from removed features
4. **Performance** — N+1 queries, oversized payloads, unbounded loops
5. **Security** — exposed keys, unvalidated inputs, missing auth

### Rules
- Do NOT change DB schema or models without explicit user approval
- Do NOT touch `backend/app/services/user_context.py` or any context-layer integration
- Do NOT refactor for style alone — only behavior fixes
- Group findings by severity: 🔴 critical, 🟡 should-fix, 🟢 nice-to-have

### Output format
Numbered list of findings with `file:line`. For each: what's wrong, what to change, severity.
**Wait for the user to say "do 1, 3, 5" before making any changes.**
