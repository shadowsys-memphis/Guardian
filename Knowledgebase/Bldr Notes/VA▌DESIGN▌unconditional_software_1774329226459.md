# UNCONDITIONAL SOFTWARE - Design Philosophy
**Created:** January 18, 2026
**Source:** Raymo via Wispr Flow - 05:45-05:47 AM

---

## Core Concept

> "Is if it not just lowered expectations programmatically, but 110% eliminates it."
> "But you know what would make it unconditional software?"

**Unconditional Software** = Software that doesn't just lower cognitive expectations, it **eliminates the need for programmatic thought entirely**.

---

## Design Principles

### 1. Zero Thinking Load
- No decisions required
- No choices to make
- No reading required
- Single action per screen

### 2. Technology Invisibility
> "He already has a very big distaste for anything technological."

The user should never feel like they're "using technology":
- No app icons to find
- No passwords to remember
- No screens to navigate
- Voice/sound driven, not visual

### 3. Automatic, Not Interactive
Traditional software: User initiates action → System responds
Unconditional software: System initiates → User confirms (or doesn't)

Example:
- **Traditional**: User opens app, finds task, marks complete
- **Unconditional**: Voice says "Time to shower" → Shower happens (or doesn't) → System detects/assumes outcome

### 4. Failure-Proof
- No wrong answers
- No error states
- No "you forgot to do X" guilt
- Missed task = just gone, next prompt comes

---

## Implementation Approach

### Input Methods (Zero Tech Feel)
1. **Voice prompts** (ElevenLabs Jessica) - system speaks TO him
2. **Physical buttons** (large, single purpose) - one button = one action
3. **Sound cues** (naval bells, motorsport sounds) - familiar, non-tech
4. **Alexa integration** - voice assistant he can ignore or respond to

### No Screens Required
- Tablet/phone can exist but isn't required
- All prompts delivered via audio
- All confirmations via voice or physical button
- Screen is for Raymo (caregiver) to monitor, not for Pops to use

### State Machine, Not Task List
Instead of: "Here are 15 tasks to complete"
Use: "It's shower time" → wait → "It's breakfast time" → wait → ...

The system moves through states regardless of completion:
```
0400: Wake state (no prompt)
0430: Meds prompt
0500: Hygiene prompt
0600: Breakfast prompt
...
```

If a prompt is ignored, system moves to next state. No guilt, no tracking visible to user.

---

## What This Means for pops-tracker

### Current App (Wrong Approach)
- Visual task cards
- Checkboxes to tap
- Progress rings
- Streak tracking shown to user
- Requires opening app, navigating, interacting

### Unconditional Approach
- **Audio-first**: Jessica's voice delivers prompts via speaker/Alexa
- **Background tracking**: System logs what happened (for Raymo)
- **No user interaction required**: Prompts happen, life continues
- **Physical fallback**: Large button press = "done" (optional)

---

## Technical Architecture

```
┌─────────────────────────────────────────────┐
│              POPS (User)                     │
│         (No tech interaction)                │
└─────────────────────────────────────────────┘
                    ▲
                    │ Audio prompts
                    │ Sound cues
                    │
┌─────────────────────────────────────────────┐
│           UNCONDITIONAL LAYER               │
│  - ElevenLabs (Jessica voice)                │
│  - ntfy.sh (triggers)                       │
│  - Alexa (delivery)                         │
│  - Naval/Motorsport sounds                  │
└─────────────────────────────────────────────┘
                    ▲
                    │ State transitions
                    │ Schedule triggers
                    │
┌─────────────────────────────────────────────┐
│           STATE MACHINE                     │
│  - Quarter system (Q1-Q4)                   │
│  - Haldol cycle awareness                   │
│  - Time-based transitions                   │
│  - No user input required                   │
└─────────────────────────────────────────────┘
                    ▲
                    │ Monitoring only
                    │
┌─────────────────────────────────────────────┐
│           RAYMO (Caregiver)                 │
│  - Dashboard view                           │
│  - Logs and tracking                        │
│  - Configuration                            │
│  - Override controls                        │
└─────────────────────────────────────────────┘
```

---

## MVP Features

### Phase 1: Audio Prompts Only
1. Scheduled voice prompts via ntfy → phone → speaker
2. Jessica voice (ElevenLabs) pre-recorded for each prompt
3. No user interaction required
4. Raymo receives notification of what was prompted

### Phase 2: Add Confirmation (Optional)
1. Single physical button or voice response
2. "Done" button press logs completion
3. Still works if button never pressed

### Phase 3: Smart Detection
1. Motion sensors detect activity
2. System infers task completion
3. No user action required at all

---

## This Is The Goal

> "I don't care if my financial engines fail. I don't care if I ever succeed in anything in AI except for this."

This unconditional software approach is what could help "not just him, but possibly millions of people."

Build it right.
